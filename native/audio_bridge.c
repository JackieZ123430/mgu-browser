/* SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Leon Pllana
 *
 * An unprivileged PCM bridge between the browser's private ALSA file sink and
 * the head unit's system ALSA/SmartX installation. No vehicle libraries are
 * redistributed. Input is S16_LE, 48000 Hz, stereo. Control on stdin: 1/0/q.
 * Build on x86_64 with -Wl,--wrap=__libc_start_main to retain the old system ABI.
 */
#define _GNU_SOURCE
#include <dlfcn.h>
#include <errno.h>
#include <fcntl.h>
#include <limits.h>
#include <inttypes.h>
#include <poll.h>
#include <signal.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/prctl.h>
#include <sys/stat.h>
#include <sys/syscall.h>
#include <sys/types.h>
#include <time.h>
#include <unistd.h>

#if defined(__x86_64__) && defined(__GLIBC__)
/* Modern build hosts otherwise introduce GLIBC_2.34 only for these entry
 * points. The bridge uses the original x86_64 ABI available on the head unit.
 * stat/fcntl below use kernel syscalls, avoiding newer libc wrappers as well. */
extern void *mgu_dlopen(const char *, int);
extern void *mgu_dlsym(void *, const char *);
extern int mgu_dlclose(void *);
extern unsigned long mgu_strtoul(const char *, char **, int);
__asm__(".symver mgu_dlopen,dlopen@GLIBC_2.2.5");
__asm__(".symver mgu_dlsym,dlsym@GLIBC_2.2.5");
__asm__(".symver mgu_dlclose,dlclose@GLIBC_2.2.5");
__asm__(".symver mgu_strtoul,strtoul@GLIBC_2.2.5");
#define dlopen mgu_dlopen
#define dlsym mgu_dlsym
#define dlclose mgu_dlclose
#define strtoul mgu_strtoul
extern int mgu_libc_start(int (*)(int, char **, char **), int, char **,
                          void (*)(void), void (*)(void), void (*)(void), void *);
__asm__(".symver mgu_libc_start,__libc_start_main@GLIBC_2.2.5");
int __wrap___libc_start_main(int (*fn)(int, char **, char **), int argc, char **argv,
                            void (*init)(void), void (*fini)(void),
                            void (*rtld_fini)(void), void *stack) {
    return mgu_libc_start(fn, argc, argv, init, fini, rtld_fini, stack);
}
#endif

#define DEVICE "plug:smartx:CarLifeMedia_CF_48_STEREO"
#define LOCK "/run/smartx/smartx_CarLifeMedia_CF_48_STEREO_p.lock"
#define CHUNK 1920U                 /* 10 ms at 48 kHz, two 16-bit channels */
#define QUEUE_BYTES (CHUNK * 6U)    /* at most 60 ms of waiting sound */
#define TICK_NS 10000000LL
#define MAX_WAIT_NS 60000000LL

typedef struct snd_pcm snd_pcm_t;
static struct {
    void *lib;
    int (*open)(snd_pcm_t **, const char *, int, int);
    int (*params)(snd_pcm_t *, int, int, unsigned, unsigned, int, unsigned);
    long (*writei)(snd_pcm_t *, const void *, unsigned long);
    int (*recover)(snd_pcm_t *, int, int);
    int (*delay)(snd_pcm_t *, long *);
    int (*close)(snd_pcm_t *);
} alsa;
static volatile sig_atomic_t stopping;
static snd_pcm_t *pcm;
static int input_fd = -1;
static unsigned char queue[QUEUE_BYTES];
static size_t queued;
static int64_t queued_at;
static uint64_t written_bytes, dropped_bytes, errors;

static void stop_signal(int sig) { (void)sig; stopping = 1; }
static void open_timeout(int sig) {
    (void)sig;
    static const char message[] = "ERROR alsa-timeout\n";
    (void)write(STDOUT_FILENO, message, sizeof(message) - 1);
    _exit(2);
}
static void report(const char *message) { puts(message); fflush(stdout); }
static void report_stats(void) {
    printf("STATS %" PRIu64 " %" PRIu64 " %" PRIu64 "\n", written_bytes, dropped_bytes, errors);
    fflush(stdout);
}
static int64_t now_ns(void) {
    struct timespec ts;
    if (clock_gettime(CLOCK_MONOTONIC, &ts)) return 0;
    return (int64_t)ts.tv_sec * 1000000000LL + ts.tv_nsec;
}
static int fd_stat(int fd, struct stat *st) { return (int)syscall(SYS_fstat, fd, st); }
static int path_stat(const char *path, struct stat *st) {
    return (int)syscall(SYS_newfstatat, AT_FDCWD, path, st, AT_SYMLINK_NOFOLLOW);
}

static int load_alsa(void) {
    alsa.lib = dlopen("libasound.so.2", RTLD_NOW | RTLD_LOCAL);
    if (!alsa.lib) return -1;
#define LOAD(field, name) do { *(void **)(&alsa.field) = dlsym(alsa.lib, name); if (!alsa.field) return -1; } while (0)
    LOAD(open, "snd_pcm_open");
    LOAD(params, "snd_pcm_set_params");
    LOAD(writei, "snd_pcm_writei");
    LOAD(recover, "snd_pcm_recover");
    LOAD(delay, "snd_pcm_delay");
    LOAD(close, "snd_pcm_close");
#undef LOAD
    return 0;
}

/* Existing locks belong to the shared audio infrastructure: never repair,
 * replace, unlink or take ownership of one. Only our newly-created own lock
 * can receive group-write permission after the stock plugin creates it. */
static int check_lock(const char *path, gid_t gid, int after, int was_missing) {
    struct stat st;
    int fd = open(path, O_RDONLY | O_NOFOLLOW | O_CLOEXEC | O_NONBLOCK);
    if (fd < 0) return !after && errno == ENOENT ? 1 : -1;
    int okay = !fd_stat(fd, &st) && S_ISREG(st.st_mode) && st.st_nlink == 1 && st.st_gid == gid;
    if (okay && after && was_missing && st.st_uid == geteuid() &&
        (st.st_mode & 07777) == 0640) {
        okay = syscall(SYS_fchmod, fd, 0660) == 0 && !fd_stat(fd, &st);
    }
    okay = okay && (st.st_mode & 07777) == 0660;
    close(fd);
    return okay ? 0 : -1;
}

static void discard_input(void) {
    /* A producer using ALSA's null slave can refill indefinitely. One bounded
     * read drops the whole kernel pipe budget without a drain-until-empty loop. */
    unsigned char discarded[4096];
    if (input_fd >= 0) {
        ssize_t bytes = read(input_fd, discarded, sizeof(discarded));
        if (bytes > 0) dropped_bytes += (uint64_t)bytes;
    }
    dropped_bytes += queued;
    queued = 0;
}
static void close_pcm(void) {
    alarm(0);
    if (pcm) { alsa.close(pcm); pcm = NULL; }
    discard_input();
}
static int open_pcm(const char *device, const char *lock, gid_t gid, int fixture) {
    if (pcm) return 0;
    int missing = fixture ? 0 : check_lock(lock, gid, 0, 0);
    if (missing < 0) { ++errors; report("ERROR smartx-lock"); return -1; }
    alarm(5);  /* A missing SmartX consumer must not strand a helper forever. */
    int result = alsa.open(&pcm, device, 0, 1 /* SND_PCM_NONBLOCK */);
    if (result >= 0) result = alsa.params(pcm, 2 /* S16_LE */, 3 /* RW_INTERLEAVED */, 2, 48000, 1, 64000);
    alarm(0);
    /* Even an unsuccessful plugin open may have created its lock. Repair only
     * our own new lock so that a failed attempt cannot deny the stock owner. */
    int lock_result = fixture ? 0 : check_lock(lock, gid, 1, missing);
    if (result < 0) { ++errors; close_pcm(); report("ERROR alsa-open"); return -1; }
    if (lock_result < 0) {
        ++errors; close_pcm(); report("ERROR smartx-lock"); return -1;
    }
    discard_input();
    return 0;
}

static void consume_tick(int64_t now) {
    unsigned char chunk[CHUNK];
    ssize_t count = read(input_fd, chunk, sizeof(chunk));
    if (count < 0 && errno != EAGAIN && errno != EINTR) { ++errors; report("ERROR fifo-read"); stopping = 1; return; }
    if (!pcm) { if (count > 0) dropped_bytes += (uint64_t)count; dropped_bytes += queued; queued = 0; return; }
    if (queued && now - queued_at >= MAX_WAIT_NS) { dropped_bytes += queued; queued = 0; }
    if (count > 0) {
        size_t bytes = (size_t)count;
        if (queued + bytes > sizeof(queue)) {
            size_t dropped = (queued + bytes - sizeof(queue) + 3U) / 4U * 4U;
            memmove(queue, queue + dropped, queued - dropped);
            queued -= dropped;
            dropped_bytes += dropped;
            queued_at += (int64_t)dropped * 1000000000LL / 192000LL;
        }
        if (!queued) queued_at = now;
        memcpy(queue + queued, chunk, bytes);
        queued += bytes;
    }
    if (queued < 4) return;
    long delay = 0;
    if (alsa.delay(pcm, &delay) >= 0 && delay > 4320) { dropped_bytes += queued; queued = 0; return; }
    long written = alsa.writei(pcm, queue, (unsigned long)(queued / 4));
    if (written == -EAGAIN || written == -EINTR) return;
    if (written < 0) {
        ++errors; dropped_bytes += queued; queued = 0;
        if (alsa.recover(pcm, (int)written, 1) < 0) { close_pcm(); report("ERROR alsa-write"); }
        return;
    }
    size_t bytes = (size_t)written * 4;
    if (bytes > queued) { ++errors; close_pcm(); report("ERROR alsa-count"); return; }
    written_bytes += bytes;
    memmove(queue, queue + bytes, queued - bytes);
    queued -= bytes;
    queued_at += (int64_t)written * 1000000000LL / 48000LL;
}

static int device_name(const char *value) {
    size_t len = strlen(value);
    if (!len || len > 127) return 0;
    for (size_t i = 0; i < len; ++i) {
        char c = value[i];
        if (!((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
              (c >= '0' && c <= '9') || strchr("_:,.=+-", c))) return 0;
    }
    return 1;
}

int main(int argc, char **argv) {
    const char *fifo = NULL, *device = NULL, *lock = NULL;
    gid_t gid = (gid_t)-1;
    int fixture = 0;
    if (!getuid() || !geteuid()) { report("ERROR unprivileged-required"); return 2; }
    for (int i = 1; i < argc; ++i) {
        if (!strcmp(argv[i], "--fixture")) { fixture = 1; continue; }
        if (i + 1 == argc) { report("ERROR arguments"); return 2; }
        const char *key = argv[i++], *value = argv[i];
        if (!strcmp(key, "--fifo") && !fifo) fifo = value;
        else if (!strcmp(key, "--device") && !device) device = value;
        else if (!strcmp(key, "--lock") && !lock) lock = value;
        else if (!strcmp(key, "--lock-gid") && gid == (gid_t)-1) {
            char *end;
            unsigned long number = strtoul(value, &end, 10);
            if (!*value || *end || number == 0 || number >= UINT32_MAX) { report("ERROR arguments"); return 2; }
            gid = (gid_t)number;
        } else { report("ERROR arguments"); return 2; }
    }
    if (!fifo || fifo[0] != '/' || strlen(fifo) >= PATH_MAX || !device || !device_name(device) ||
        (fixture ? (!getenv("MGU_EMULATOR_MODE") || strcmp(getenv("MGU_EMULATOR_MODE"), "1") || lock || gid != (gid_t)-1)
                 : (!lock || strcmp(lock, LOCK) || strcmp(device, DEVICE) || gid == (gid_t)-1 || getegid() != gid))) {
        report("ERROR arguments"); return 2;
    }
    if (!fixture) {
        /* The parent must execute this with a clean system loader environment. */
        if (getenv("LD_LIBRARY_PATH") || getenv("LD_PRELOAD")) { report("ERROR system-libraries-required"); return 2; }
        unsetenv("ALSA_CONFIG_PATH"); unsetenv("ALSA_PLUGIN_DIR"); unsetenv("ALSA_CONFIG_DIR");
    }
    umask(0007);
    struct stat before, opened;
    if (mkfifo(fifo, 0600) && errno != EEXIST) { report("ERROR fifo-create"); return 2; }
    if (path_stat(fifo, &before) || !S_ISFIFO(before.st_mode) || before.st_uid != geteuid() ||
        before.st_nlink != 1 || (before.st_mode & 0077)) { report("ERROR fifo-permissions"); return 2; }
    input_fd = open(fifo, O_RDWR | O_NONBLOCK | O_NOFOLLOW | O_CLOEXEC);
    if (input_fd < 0 || fd_stat(input_fd, &opened) || opened.st_dev != before.st_dev || opened.st_ino != before.st_ino ||
        syscall(SYS_fcntl, input_fd, F_SETPIPE_SZ, 4096) < 0 || syscall(SYS_fcntl, input_fd, F_GETPIPE_SZ, 0) > 4096) {
        report("ERROR fifo-open"); return 2;
    }
    if (load_alsa()) { report("ERROR alsa-load"); close(input_fd); return 2; }
    struct sigaction action;
    memset(&action, 0, sizeof(action)); sigemptyset(&action.sa_mask); action.sa_handler = stop_signal;
    sigaction(SIGTERM, &action, NULL); sigaction(SIGINT, &action, NULL); sigaction(SIGHUP, &action, NULL);
    action.sa_handler = open_timeout; sigaction(SIGALRM, &action, NULL);
    signal(SIGPIPE, SIG_IGN);
    if (prctl(PR_SET_PDEATHSIG, SIGTERM) || getppid() == 1) { report("ERROR parent-missing"); return 2; }
    report("READY");
    char line[16]; size_t used = 0;
    int64_t tick = now_ns() + TICK_NS;
    while (!stopping) {
        int64_t now = now_ns();
        if (now - tick > MAX_WAIT_NS) { discard_input(); tick = now; }
        if (now >= tick) { consume_tick(now); tick += TICK_NS; }
        int wait = (int)((tick - now_ns() + 999999LL) / 1000000LL);
        if (wait < 0) wait = 0;
        if (wait > 10) wait = 10;
        struct pollfd fd = { STDIN_FILENO, POLLIN, 0 };
        int ready = poll(&fd, 1, wait);
        if (ready < 0) { if (errno != EINTR) stopping = 1; continue; }
        if (!(fd.revents & (POLLIN | POLLHUP | POLLERR))) continue;
        char chars[64]; ssize_t got = read(STDIN_FILENO, chars, sizeof(chars));
        if (got <= 0) { if (!got || errno != EINTR) stopping = 1; continue; }
        for (ssize_t i = 0; i < got && !stopping; ++i) {
            char c = chars[i];
            if (c == '\r') continue;
            if (c != '\n') {
                if (used + 1 >= sizeof(line)) { report("ERROR control"); stopping = 1; break; }
                line[used++] = c; continue;
            }
            line[used] = '\0'; used = 0;
            if (!strcmp(line, "1")) { if (!open_pcm(device, lock, gid, fixture)) { tick = now_ns() + TICK_NS; report("OPEN"); } }
            else if (!strcmp(line, "0")) { close_pcm(); report_stats(); report("CLOSED"); }
            else if (!strcmp(line, "q")) stopping = 1;
            else { report("ERROR control"); stopping = 1; }
        }
    }
    close_pcm(); report_stats(); close(input_fd);
    if (alsa.lib) dlclose(alsa.lib);
    return 0;
}

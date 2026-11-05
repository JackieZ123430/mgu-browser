#define _GNU_SOURCE
#include <grp.h>
#include <sched.h>
#include <stdio.h>
#include <sys/mount.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <unistd.h>

/* Browser-only resolver view. No network namespace and no global DNS change.
 * The helper performs one fixed private mount, drops privileges, then execs
 * one fixed unprivileged browser supervisor. No arbitrary command/path input. */
int main(int argc,char **argv) {
    (void)argc;
    const uid_t uid=getuid();const gid_t gid=getgid();
    const char *source="/var/opt/mgu-browser/network/resolv.conf";
    struct stat st;
    if(uid!=12443||gid!=12443||geteuid()!=0){fputs("browser-netns: browser uid required\n",stderr);return 125;}
    if(lstat(source,&st)||!S_ISREG(st.st_mode)||st.st_uid!=0||(st.st_mode&0022)){fputs("browser-netns: protected resolver missing\n",stderr);return 125;}
    if(unshare(CLONE_NEWNS)){perror("browser-netns unshare");return 125;}
    if(mount(NULL,"/",NULL,MS_REC|MS_PRIVATE,NULL)){perror("browser-netns private mount");return 125;}
    if(mount(source,"/etc/resolv.conf",NULL,MS_BIND,NULL)){perror("browser-netns resolver mount");return 125;}
    if(setgroups(0,NULL)||setresgid(gid,gid,gid)||setresuid(uid,uid,uid)){perror("browser-netns drop privileges");return 125;}
    argv[0]="/var/opt/mgu-browser/engine/browser-launch";
    execv(argv[0],argv);perror("browser-netns exec");return 127;
}

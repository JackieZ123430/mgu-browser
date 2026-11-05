#define _GNU_SOURCE
#include <errno.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <sys/prctl.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <unistd.h>

/* Unprivileged process-group supervisor. If the OAP/Node parent disappears,
 * terminate the entire browser group, including its zygotes. No root helper,
 * vehicle interface, user setting or safety override lives here. */
static volatile sig_atomic_t stopping=0;
static volatile sig_atomic_t child_pid=0;
static void terminate(int signal_number) {
    (void)signal_number;stopping=1;
    if(child_pid>0)kill((pid_t)child_pid,SIGTERM);
}
int main(int argc, char **argv) {
    (void)argc;
    if (geteuid() == 0 || getpgrp() != getpid()) {
        fputs("browser-launch: unprivileged detached process group required\n",stderr);
        return 125;
    }
    struct sigaction action = {0};
    action.sa_handler=terminate;sigemptyset(&action.sa_mask);
    sigaction(SIGTERM,&action,NULL);sigaction(SIGINT,&action,NULL);sigaction(SIGHUP,&action,NULL);
    if(prctl(PR_SET_PDEATHSIG,SIGTERM) || getppid()==1) return 125;
    pid_t child=fork();
    if(child<0)return 125;
    if(!child){
        signal(SIGTERM,SIG_DFL);signal(SIGINT,SIG_DFL);signal(SIGHUP,SIG_DFL);
        argv[0]="/var/opt/mgu-browser/engine/chromium";
        execv(argv[0],argv);perror("browser-launch exec");_exit(127);
    }
    child_pid=child;
    close(3);close(4);
    int status;
    while(waitpid(child,&status,0)<0){if(errno!=EINTR)return 125;}
    if(WIFEXITED(status)&&WEXITSTATUS(status))fprintf(stderr,"browser-exit status=%d\n",WEXITSTATUS(status));
    if(WIFSIGNALED(status))fprintf(stderr,"browser-exit signal=%d\n",WTERMSIG(status));
    // Normal completion stays a normal exit. Never SIGKILL our own supervisor.
    signal(SIGTERM,SIG_IGN);kill(-getpgrp(),SIGTERM);
    if(stopping)return 0;
    return WIFEXITED(status)?WEXITSTATUS(status):125;
}

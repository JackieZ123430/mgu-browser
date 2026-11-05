#define _GNU_SOURCE
#include <grp.h>
#include <sched.h>
#include <stdio.h>
#include <sys/mount.h>
#include <sys/stat.h>
#include <unistd.h>
int main(void) {
    if(getuid()!=0||geteuid()!=0){fputs("backend-launch: root service only\n",stderr);return 125;}
    const char *resolver="/var/opt/mgu-browser/network/resolv.conf";
    struct stat st;if(lstat(resolver,&st)||!S_ISREG(st.st_mode)||st.st_uid!=0||(st.st_mode&0022))return 125;
    if(unshare(CLONE_NEWNS)||mount(NULL,"/",NULL,MS_REC|MS_PRIVATE,NULL)||mount(resolver,"/etc/resolv.conf",NULL,MS_BIND,NULL)){perror("private browser resolver");return 125;}
    gid_t groups[]={12443};
    if(setgroups(1,groups)||setresgid(3911,3911,3911)||setresuid(3911,3911,3911)){perror("backend privilege drop");return 125;}
    execl("/usr/bin/node","node","/var/opt/mgu-browser/backend/server.js",NULL);
    perror("backend exec");return 127;
}

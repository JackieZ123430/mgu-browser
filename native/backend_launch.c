#define _GNU_SOURCE
#include <grp.h>
#include <errno.h>
#include <sched.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <limits.h>
#include <sys/mount.h>
#include <sys/stat.h>
#include <sys/statvfs.h>
#include <unistd.h>
static int root_directory(const char *name) {
    struct stat st;
    return !lstat(name,&st)&&S_ISDIR(st.st_mode)&&st.st_uid==0&&!(st.st_mode&0022);
}
static int work_directory(const char *name,uid_t uid,gid_t gid) {
    return !mkdir(name,0700)&&!chown(name,uid,gid);
}
static unsigned number(const char *text) {char *end;unsigned long n=strtoul(text,&end,10);return *text&&!*end&&n>=1000&&n<=65535?(unsigned)n:0;}
int main(int argc,char **argv) {
    if(getuid()!=0||geteuid()!=0){fputs("backend-launch: root service only\n",stderr);return 125;}
    const int check=argc==2&&!strcmp(argv[1],"--check");
    unsigned uid=3911,app=3911;gid_t audio_gid=0;
    if(!check){if((argc!=5&&argc!=7)||strcmp(argv[1],"--uid")||strcmp(argv[3],"--app-uid"))return 125;uid=number(argv[2]);app=number(argv[4]);if(uid!=3911||app<12203)return 125;
        if(argc==7){
            struct stat group_file;char *end;
            if(strcmp(argv[5],"--audio-gid")||lstat("/etc/group",&group_file)||!S_ISREG(group_file.st_mode)||group_file.st_uid!=0||(group_file.st_mode&0022))return 125;
            unsigned long requested=strtoul(argv[6],&end,10);if(!*argv[6]||*end||requested==0||requested>65535)return 125;
            struct group *audio_group=getgrnam("mgu_alsa");if(!audio_group||audio_group->gr_gid!=requested)return 125;audio_gid=audio_group->gr_gid;
        }
    }
    const char *resolver="/var/opt/mgu-browser/network/resolv.conf";
    struct stat st;if(lstat(resolver,&st)||!S_ISREG(st.st_mode)||st.st_uid!=0||(st.st_mode&0022))return 125;
    const char *work="/var/opt/mgu-browser/work";
    if(!root_directory("/var")||!root_directory("/var/opt")||!root_directory("/var/opt/mgu-browser")||!root_directory("/var/opt/mgu-browser/network"))return 125;
    if(mkdir(work,0755)&&errno!=EEXIST)return 125;
    if(!root_directory(work))return 125;
    if(unshare(CLONE_NEWNS)||mount(NULL,"/",NULL,MS_REC|MS_PRIVATE,NULL)||mount(resolver,"/etc/resolv.conf",NULL,MS_BIND,NULL)){perror("private browser resolver");return 125;}
    /* A real aggregate quota, including IndexedDB, caches and temporary files.
     * This mount exists only in the service namespace and vanishes on stop. */
    char options[128];snprintf(options,sizeof options,"size=128m,nr_inodes=16384,mode=0700,uid=%u,gid=%u",uid,app);
    if(mount("mgu-browser-work",work,"tmpfs",MS_NODEV|MS_NOSUID|MS_NOEXEC,options)||
       !work_directory("/var/opt/mgu-browser/work/home",uid,app)||!work_directory("/var/opt/mgu-browser/work/tmp",uid,app)||
       !work_directory("/var/opt/mgu-browser/work/cache",uid,app)||!work_directory("/var/opt/mgu-browser/work/profiles",uid,app)){
        perror("bounded browser working storage");return 125;
    }
    if(setenv("HOME","/var/opt/mgu-browser/work/home",1)||setenv("TMPDIR","/var/opt/mgu-browser/work/tmp",1)||
       setenv("XDG_CACHE_HOME","/var/opt/mgu-browser/work/cache",1))return 125;
    char id[24];snprintf(id,sizeof id,"%u",uid);if(setenv("MGU_BROWSER_UID",id,1))return 125;snprintf(id,sizeof id,"%u",app);if(setenv("MGU_BROWSER_APP_UID",id,1))return 125;
    if(unsetenv("MGU_BROWSER_AUDIO_GID")||unsetenv("MGU_BROWSER_AUDIO_OWNER"))return 125;
    if(audio_gid){snprintf(id,sizeof id,"%u",(unsigned)audio_gid);if(setenv("MGU_BROWSER_AUDIO_GID",id,1))return 125;}
    gid_t groups[]={app,audio_gid};gid_t primary=audio_gid?audio_gid:uid;
    // SmartX creates its lock under the writer's primary group. Keep the
    // existing mgu_alsa group, never run the browser or writer as ent_alsa/root.
    if(setgroups(audio_gid?2:1,groups)||setresgid(primary,primary,primary)||setresuid(uid,uid,uid)){perror("backend privilege drop");return 125;}
    struct statvfs capacity;
    if(statvfs(work,&capacity)||capacity.f_blocks*capacity.f_frsize>128UL*1024*1024||
       !(capacity.f_flag&ST_NOSUID)||!(capacity.f_flag&ST_NOEXEC))return 125;
    if(check){printf("{\"uid\":%u,\"gid\":%u,\"workBytes\":%lu,\"noexec\":true,\"nosuid\":true}\n",(unsigned)getuid(),(unsigned)getgid(),capacity.f_blocks*capacity.f_frsize);return 0;}
    execl("/usr/bin/node","node","/var/opt/mgu-browser/current/backend/server.js",NULL);
    perror("backend exec");return 127;
}

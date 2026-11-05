#define _GNU_SOURCE
#include <dbus/dbus.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

static const char *DEST="fi.w1.wpa_supplicant1";
static const char *IFACE="fi.w1.wpa_supplicant1.Interface";
static const char *PATH="/fi/w1/wpa_supplicant1/Interfaces/1";
static DBusConnection *bus;
static DBusMessage *request(DBusMessage *message) {
    DBusError error;dbus_error_init(&error);
    DBusMessage *reply=dbus_connection_send_with_reply_and_block(bus,message,10000,&error);
    dbus_message_unref(message);
    if(!reply){fprintf(stderr,"WPA method failed: %s\n",error.name?error.name:"unknown");dbus_error_free(&error);}
    return reply;
}
static void string_entry(DBusMessageIter *dict,const char *key,const char *value) {
    DBusMessageIter entry,variant;
    dbus_message_iter_open_container(dict,DBUS_TYPE_DICT_ENTRY,NULL,&entry);
    dbus_message_iter_append_basic(&entry,DBUS_TYPE_STRING,&key);
    dbus_message_iter_open_container(&entry,DBUS_TYPE_VARIANT,"s",&variant);
    dbus_message_iter_append_basic(&variant,DBUS_TYPE_STRING,&value);
    dbus_message_iter_close_container(&entry,&variant);dbus_message_iter_close_container(dict,&entry);
}
static int unescape(const char *in,char *out,size_t cap) {
    size_t n=0;
    for(size_t i=0;in[i];i++){
        char c=in[i];if(c=='\\'){
            c=in[++i];if(!c)return -1;
            if(c=='s')c=' ';else if(c=='n')c='\n';else if(c=='r')c='\r';else if(c=='t')c='\t';else if(c!='\\')return -1;
        }
        if(n+1>=cap)return -1;
        out[n++]=c;
    }
    out[n]=0;return (int)n;
}
static int state(char *out,size_t cap) {
    DBusMessage *m=dbus_message_new_method_call(DEST,PATH,"org.freedesktop.DBus.Properties","Get");
    const char *name="State";dbus_message_append_args(m,DBUS_TYPE_STRING,&IFACE,DBUS_TYPE_STRING,&name,DBUS_TYPE_INVALID);
    DBusMessage *r=request(m);if(!r)return -1;
    DBusMessageIter it,v;dbus_message_iter_init(r,&it);dbus_message_iter_recurse(&it,&v);
    if(dbus_message_iter_get_arg_type(&v)!=DBUS_TYPE_STRING){dbus_message_unref(r);return -1;}
    const char *s;dbus_message_iter_get_basic(&v,&s);snprintf(out,cap,"%s",s);dbus_message_unref(r);return 0;
}
int main(int argc,char **argv) {
    if(geteuid()!=0||argc!=2){fputs("root + existing private profile path required\n",stderr);return 2;}
    struct stat st;if(lstat(argv[1],&st)||!S_ISREG(st.st_mode)||st.st_uid!=0||(st.st_mode&0077)){fputs("profile must be root-owned mode 0600\n",stderr);return 2;}
    FILE *file=fopen(argv[1],"r");if(!file)return 2;
    char line[1024],hex[65]={0},secret[256]={0};
    while(fgets(line,sizeof line,file)){
        line[strcspn(line,"\r\n")]=0;
        if(!strncmp(line,"SSID=",5)){
            if(strlen(line+5)>=sizeof hex){fclose(file);explicit_bzero(secret,sizeof secret);return 2;}
            memcpy(hex,line+5,strlen(line+5)+1);
        }
        if(!strncmp(line,"Passphrase=",11)&&unescape(line+11,secret,sizeof secret)<0){fclose(file);return 2;}
    }
    fclose(file);explicit_bzero(line,sizeof line);
    unsigned char ssid[32];size_t bytes=strlen(hex)/2;
    if(!bytes||bytes>32||strlen(hex)%2||strlen(secret)<8||strlen(secret)>64)return 2;
    for(size_t i=0;i<bytes;i++){unsigned value;char part[3]={hex[i*2],hex[i*2+1],0};if(sscanf(part,"%2x",&value)!=1)return 2;ssid[i]=(unsigned char)value;}
    DBusError error;dbus_error_init(&error);bus=dbus_bus_get(DBUS_BUS_SYSTEM,&error);
    if(!bus){fputs("system D-Bus unavailable\n",stderr);return 3;}
    // Verify that this is still the existing managed station, not a P2P group.
    DBusMessage *check=dbus_message_new_method_call(DEST,PATH,"org.freedesktop.DBus.Properties","Get");
    const char *prop="Ifname";dbus_message_append_args(check,DBUS_TYPE_STRING,&IFACE,DBUS_TYPE_STRING,&prop,DBUS_TYPE_INVALID);
    DBusMessage *cr=request(check);if(!cr)return 3;
    DBusMessageIter ci,cv;dbus_message_iter_init(cr,&ci);dbus_message_iter_recurse(&ci,&cv);const char *ifname=NULL;
    if(dbus_message_iter_get_arg_type(&cv)==DBUS_TYPE_STRING)dbus_message_iter_get_basic(&cv,&ifname);
    int station=ifname&&!strcmp(ifname,"wlan0");dbus_message_unref(cr);if(!station){fputs("station interface mapping changed\n",stderr);return 3;}
    DBusMessage *m=dbus_message_new_method_call(DEST,PATH,IFACE,"AddNetwork");
    DBusMessageIter it,dict,entry,variant,array;dbus_message_iter_init_append(m,&it);
    dbus_message_iter_open_container(&it,DBUS_TYPE_ARRAY,"{sv}",&dict);
    const char *ssid_key="ssid";dbus_message_iter_open_container(&dict,DBUS_TYPE_DICT_ENTRY,NULL,&entry);
    dbus_message_iter_append_basic(&entry,DBUS_TYPE_STRING,&ssid_key);dbus_message_iter_open_container(&entry,DBUS_TYPE_VARIANT,"ay",&variant);
    dbus_message_iter_open_container(&variant,DBUS_TYPE_ARRAY,"y",&array);const unsigned char *p=ssid;
    dbus_message_iter_append_fixed_array(&array,DBUS_TYPE_BYTE,&p,(int)bytes);
    dbus_message_iter_close_container(&variant,&array);dbus_message_iter_close_container(&entry,&variant);dbus_message_iter_close_container(&dict,&entry);
    string_entry(&dict,"psk",secret);string_entry(&dict,"key_mgmt","WPA-PSK");
    dbus_message_iter_close_container(&it,&dict);explicit_bzero(secret,sizeof secret);
    DBusMessage *r=request(m);if(!r)return 4;
    const char *result=NULL;dbus_message_get_args(r,NULL,DBUS_TYPE_OBJECT_PATH,&result,DBUS_TYPE_INVALID);
    char network[256];if(!result){dbus_message_unref(r);return 4;}snprintf(network,sizeof network,"%s",result);dbus_message_unref(r);
    m=dbus_message_new_method_call(DEST,PATH,IFACE,"SelectNetwork");const char *n=network;
    dbus_message_append_args(m,DBUS_TYPE_OBJECT_PATH,&n,DBUS_TYPE_INVALID);r=request(m);if(!r)return 5;dbus_message_unref(r);
    char current[64]="unknown";
    for(int i=0;i<35;i++){if(!state(current,sizeof current)&&!strcmp(current,"completed")){printf("{\"state\":\"completed\",\"interface\":\"wlan0\",\"network\":\"%s\"}\n",network);return 0;}sleep(1);}
    fprintf(stderr,"WPA station not associated; state=%s\n",current);return 6;
}

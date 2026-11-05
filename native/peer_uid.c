#define _GNU_SOURCE
#define NAPI_VERSION 3
#include <node_api.h>
#include <sys/socket.h>
#include <sys/types.h>

static napi_value peer_uid(napi_env env,napi_callback_info info) {
    size_t argc=1;napi_value argv[1],result;int32_t fd;
    if(napi_get_cb_info(env,info,&argc,argv,NULL,NULL)!=napi_ok||argc!=1||napi_get_value_int32(env,argv[0],&fd)!=napi_ok){napi_throw_type_error(env,NULL,"socket fd required");return NULL;}
    struct ucred credentials;socklen_t size=sizeof credentials;
    if(getsockopt(fd,SOL_SOCKET,SO_PEERCRED,&credentials,&size)||size!=sizeof credentials){napi_throw_error(env,NULL,"peer credential query failed");return NULL;}
    napi_create_uint32(env,(uint32_t)credentials.uid,&result);return result;
}
static napi_value init(napi_env env,napi_value exports) {
    napi_value fn;napi_create_function(env,"peerUid",NAPI_AUTO_LENGTH,peer_uid,NULL,&fn);napi_set_named_property(env,exports,"peerUid",fn);return exports;
}
/* Node 8 uses constructor registration; modern NAPI_MODULE exports alone are
 * not discovered by the stock MGU loader. Keep the stable N-API function ABI. */
static napi_module registration={1,0,__FILE__,init,"peer_uid",NULL,{NULL}};
__attribute__((constructor)) static void register_peer(void) {
    napi_module_register(&registration);
}

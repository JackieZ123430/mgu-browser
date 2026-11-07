#define NAPI_VERSION 3
#include <node_api.h>
#include <stdio.h>
#include <stdlib.h>
#include <stddef.h>
#include <setjmp.h>
#include <jpeglib.h>

struct decoder { struct jpeg_decompress_struct jpeg; struct jpeg_error_mgr error; jmp_buf jump; int created; };
static void fail(j_common_ptr c) { struct decoder *d=(struct decoder *)((char *)c->err - offsetof(struct decoder,error)); longjmp(d->jump,1); }
static void quiet(j_common_ptr c) { (void)c; }
static napi_value decode(napi_env env,napi_callback_info info) {
    size_t argc=1,size=0; napi_value argv[1],buffer,result,value; void *input,*pixels; bool is_buffer=false;
    napi_get_cb_info(env,info,&argc,argv,NULL,NULL);
    if(argc!=1||napi_is_buffer(env,argv[0],&is_buffer)!=napi_ok||!is_buffer||napi_get_buffer_info(env,argv[0],&input,&size)!=napi_ok||size<4||size>2097152){napi_throw_type_error(env,NULL,"JPEG buffer required (4 bytes to 2 MiB)");return NULL;}
    struct decoder *d=calloc(1,sizeof *d);
    if(!d){napi_throw_error(env,NULL,"JPEG allocation failed");return NULL;}
    d->jpeg.err=jpeg_std_error(&d->error);d->error.error_exit=fail;d->error.output_message=quiet;d->jpeg.client_data=d;
    if(setjmp(d->jump)){if(d->created)jpeg_destroy_decompress(&d->jpeg);free(d);napi_throw_error(env,NULL,"Invalid or unsupported JPEG frame");return NULL;}
    jpeg_create_decompress(&d->jpeg);d->created=1;d->jpeg.client_data=d;
    jpeg_mem_src(&d->jpeg,input,size);jpeg_read_header(&d->jpeg,TRUE);
    if(!d->jpeg.image_width||!d->jpeg.image_height||d->jpeg.image_width>1280||d->jpeg.image_height>720)fail((j_common_ptr)&d->jpeg);
    d->jpeg.out_color_space=JCS_EXT_RGBA;d->jpeg.dct_method=JDCT_IFAST;
    jpeg_start_decompress(&d->jpeg);
    const unsigned width=d->jpeg.output_width,height=d->jpeg.output_height;
    if(d->jpeg.output_components!=4||napi_create_buffer(env,(size_t)width*height*4,&pixels,&buffer)!=napi_ok){jpeg_destroy_decompress(&d->jpeg);free(d);napi_throw_error(env,NULL,"JPEG output allocation failed");return NULL;}
    while(d->jpeg.output_scanline<height){JSAMPROW row=(unsigned char *)pixels+(size_t)d->jpeg.output_scanline*width*4;if(jpeg_read_scanlines(&d->jpeg,&row,1)!=1)fail((j_common_ptr)&d->jpeg);}
    jpeg_finish_decompress(&d->jpeg);jpeg_destroy_decompress(&d->jpeg);free(d);
    napi_create_object(env,&result);napi_create_uint32(env,width,&value);napi_set_named_property(env,result,"width",value);
    napi_create_uint32(env,height,&value);napi_set_named_property(env,result,"height",value);napi_set_named_property(env,result,"rgba",buffer);return result;
}
static napi_value init(napi_env env,napi_value exports){napi_value fn;napi_create_function(env,"decode",NAPI_AUTO_LENGTH,decode,NULL,&fn);napi_set_named_property(env,exports,"decode",fn);return exports;}
static napi_module registration={1,0,__FILE__,init,"jpeg_frame",NULL,{NULL}};
__attribute__((constructor)) static void register_decoder(void){napi_module_register(&registration);}

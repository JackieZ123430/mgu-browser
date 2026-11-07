'use strict';
// Shared by the pinned MIT app-kit hook and the Browser frontend. MainApp's
// requested exit keeps its original 200 ms grace, with bounded async cleanup.
const tasks=[];
let completion=null,started=false;
function register(task){
    if(typeof task!=='function')throw new TypeError('Shutdown cleanup must be a function');
    if(started)throw new Error('Shutdown already requested');
    tasks.push(task);
}
function run(exit){
    if(completion)return completion;
    if(typeof exit!=='function')throw new TypeError('Shutdown exit must be a function');
    started=true;
    completion=new Promise((resolve,reject)=>{
        let finished=false,grace=false,clean=false;
        const finish=()=>{
            if(finished)return;finished=true;clearTimeout(minimum);clearTimeout(deadline);
            try{exit();resolve();}catch(error){reject(error);}
        };
        const minimum=setTimeout(()=>{grace=true;if(clean)finish();},200);
        const deadline=setTimeout(finish,1500);
        Promise.all(tasks.map(task=>Promise.resolve().then(task).catch(()=>{}))).then(()=>{clean=true;if(grace)finish();});
    });
    return completion;
}
module.exports={register,run};

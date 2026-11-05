'use strict';
module.exports=function icon(c,name,x,y,color){
    const line=(a,b,d,e)=>c.line(x+a,y+b,x+d,y+e,2.1,color),poly=pts=>c.polyline(pts.map(p=>[x+p[0],y+p[1]]),2.1,color);
    if(name==='back'||name==='forward'){const s=name==='back'?1:-1;line(9*s,0,-9*s,0);poly([[0*s,-8],[-9*s,0],[0*s,8]]);}
    else if(name==='home'){poly([[-11,-1],[0,-10],[11,-1]]);poly([[-8,-3],[-8,10],[-2,10],[-2,3],[3,3],[3,10],[8,10],[8,-3]]);}
    else if(name==='reload'){c.arc(x,y,8,10,40,330,color);poly([[9,-10],[10,-2],[2,-3]]);}
    else if(name==='close'){line(-7,-7,7,7);line(7,-7,-7,7);}
    else if(name==='stop')c.strokeRoundRect(x-7,y-7,14,14,2,2,color);
    else if(name==='star'){const p=[];for(let i=0;i<=10;i++){const a=(i*36-90)*Math.PI/180,r=i%2?4.5:11;p.push([Math.cos(a)*r,Math.sin(a)*r]);}poly(p);}
    else if(name==='history'){c.arc(x,y,9,11,0,360,color);line(0,-6,0,0);line(0,0,5,3);}
    else if(name==='settings'){c.arc(x,y,5,7,0,360,color);for(let i=0;i<8;i++){const a=i*Math.PI/4;line(Math.cos(a)*9,Math.sin(a)*9,Math.cos(a)*12,Math.sin(a)*12);}}
    else if(name==='keyboard'){c.strokeRoundRect(x-13,y-9,26,18,3,1.7,color);for(let r=0;r<2;r++)for(let k=0;k<4;k++)c.fillRect(x-9+k*5,y-5+r*5,2.5,2.5,color);line(-5,5,6,5);}
    else if(name==='expand'){poly([[-4,-10],[-11,-10],[-11,-3]]);poly([[4,-10],[11,-10],[11,-3]]);poly([[-4,10],[-11,10],[-11,3]]);poly([[4,10],[11,10],[11,3]]);}
    else if(name==='more'){for(let i=-1;i<=1;i++)c.circle(x+i*6,y,1.8,color);}
    else if(name==='search'){c.arc(x-2,y-2,6,8,0,360,color);line(4,4,10,10);}
    else if(name==='cursor'){poly([[-8,-11],[-8,10],[-2,4],[3,12],[7,10],[2,2],[10,2],[-8,-11]]);}
};

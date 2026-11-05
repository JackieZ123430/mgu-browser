'use strict';
// Same enum as the pinned SDK kit's car.js; NP does not confirm P.
function powerTrainPark(raw){return raw==='P'||raw===3?'P':null;}
module.exports={powerTrainPark};

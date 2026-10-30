const {extractBearerToken}=require('./requireAuthenticatedContext');
const {handler}=require('../routes/jobRoutes');
const P=require('../services/jobPolicy');
function createRequireDeviceContext({runtime}) {
  return async(req,res,next)=>handler(async()=>{
    const ctx=await runtime.authenticate(extractBearerToken(req));
    ctx.sessionId=P.uuid(req.headers['x-leadhunt-runtime-session']);
    req.deviceContext=ctx;next();
  })(req,res);
}
module.exports={createRequireDeviceContext};

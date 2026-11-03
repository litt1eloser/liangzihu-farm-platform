import {endpoint,json} from '@/modules/identity/http';
import {requireActor} from '@/modules/identity/session';
import {getPool} from '@/db/pool';
import {getCameraEzopenSession} from '@/modules/cameras/readonly';
import {AppError} from '@/platform/error';

// Web 播放器会接触萤石令牌和设备验证码，所以只允许管理角色在显式开关下试点。
export async function GET(request:Request,context:{params:Promise<{id:string}>}){
 return endpoint(async()=>{
  const actor=await requireActor(request);
  if(actor.role!=='admin')
   throw new AppError(403,'CAMERA_BROWSER_SCOPE','加密试点播放仅向管理账号开放');
  if(process.env.CAMERA_EZOPEN_BROWSER_ENABLED!=='1')
   throw new AppError(503,'CAMERA_BROWSER_DISABLED','加密试点播放尚未启用');
  const {id}=await context.params;
  return json(await getCameraEzopenSession(getPool(),actor,id));
 });
}

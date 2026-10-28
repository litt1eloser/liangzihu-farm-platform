import {readApi} from '@/platform/api';
import {camerasForObject} from '@/modules/cameras/by-object';

/** Used by field pages; no playback or capture request is made by this GET. */
export const GET=(request:Request)=>readApi(request,(c,actor)=>
 camerasForObject(c,actor,new URL(request.url).searchParams.get('objectId')));

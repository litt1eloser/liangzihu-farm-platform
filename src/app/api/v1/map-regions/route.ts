import { readApi, writeApi } from '@/platform/api';
import { assignRegion, listRegions, saveRegion, setRegionArchive } from '@/modules/map/regions';
export function GET(request: Request) { return readApi(request, listRegions); }
export function POST(request: Request) { return writeApi(request, saveRegion, 201); }
export function PATCH(request: Request) { return writeApi(request, (c,a,b) => b.action === 'archive' ? setRegionArchive(c,a,b) : b.action === 'assign' ? assignRegion(c,a,b) : saveRegion(c,a,b)); }

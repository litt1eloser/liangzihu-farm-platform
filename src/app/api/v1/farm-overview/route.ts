import { readApi } from '@/platform/api';
import { farmOverview } from '@/modules/map/overview';
export function GET(request: Request) { return readApi(request, farmOverview); }

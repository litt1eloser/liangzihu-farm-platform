import { writeApi } from '@/platform/api';
import { setObjectArchive } from '@/modules/registry/objects';
export function POST(request: Request) { return writeApi(request, setObjectArchive); }

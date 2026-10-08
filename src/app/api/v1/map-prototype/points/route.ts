import { readApi, writeApi } from '@/platform/api';
import { createDraftPoint, listDraftPoints } from '@/modules/map-prototype/draft-points';

export function GET(request: Request) {
  return readApi(request, listDraftPoints);
}

export function POST(request: Request) {
  return writeApi(request, createDraftPoint, 201);
}

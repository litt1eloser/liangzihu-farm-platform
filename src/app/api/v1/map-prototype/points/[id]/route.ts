import { writeApi } from '@/platform/api';
import { deleteDraftPoint, updateDraftPoint } from '@/modules/map-prototype/draft-points';

type Context = { params: Promise<{ id: string }> };

export function PATCH(request: Request, context: Context) {
  return writeApi(request, async (client, actor, body) =>
    updateDraftPoint(client, actor, (await context.params).id, body));
}

export function DELETE(request: Request, context: Context) {
  return writeApi(request, async (client, actor, body) =>
    deleteDraftPoint(client, actor, (await context.params).id, body));
}

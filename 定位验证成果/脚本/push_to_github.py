# -*- coding: utf-8 -*-
"""经 api.github.com REST API 推送 定位验证成果/ 到 liangzihu-farm-platform 新分支。
token 从 git credential manager 读取,不打印。"""
import io, os, sys, json, base64, time, subprocess, urllib.request, urllib.error
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

OWNER, REPO = 'litt1eloser', 'liangzihu-farm-platform'
SRC = r'D:\1科研\nongye\定位验证成果'
PREFIX = '定位验证成果'
BRANCH = 'cad-geo-verification'
API = 'https://api.github.com'

p = subprocess.run(['git', 'credential', 'fill'], input='protocol=https\nhost=github.com\n\n',
                   capture_output=True, text=True)
creds = dict(l.split('=', 1) for l in p.stdout.strip().splitlines() if '=' in l)
TOKEN = creds.get('password')
assert TOKEN, '未能从 git credential 获取 token'
print('token 获取成功(未显示)')

def api(method, path, data=None, retry=4):
    url = API + path
    for i in range(retry):
        try:
            body = json.dumps(data).encode('utf-8') if data is not None else None
            req = urllib.request.Request(url, data=body, method=method, headers={
                'Authorization': f'Bearer {TOKEN}',
                'Accept': 'application/vnd.github+json',
                'User-Agent': 'kimi-code-push',
                'X-GitHub-Api-Version': '2022-11-28'})
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.loads(r.read().decode('utf-8'))
        except urllib.error.HTTPError as e:
            txt = e.read().decode('utf-8', 'replace')[:300]
            if e.code in (403, 429, 502, 503) and i < retry - 1:
                time.sleep(5 * (i + 1)); continue
            print(f'HTTP {e.code} {method} {path}: {txt}'); raise
        except Exception as e:
            if i < retry - 1:
                time.sleep(3 * (i + 1)); continue
            raise

repo = api('GET', f'/repos/{OWNER}/{REPO}')
default_branch = repo['default_branch']
print('默认分支:', default_branch)

base_sha = api('GET', f'/repos/{OWNER}/{REPO}/git/ref/heads/{default_branch}')['object']['sha']
print('base sha:', base_sha[:10])

try:
    ref = api('POST', f'/repos/{OWNER}/{REPO}/git/refs',
              {'ref': f'refs/heads/{BRANCH}', 'sha': base_sha})
    print('已创建分支', BRANCH)
except urllib.error.HTTPError:
    ref = api('GET', f'/repos/{OWNER}/{REPO}/git/ref/heads/{BRANCH}')
    base_sha = ref['object']['sha']
    print('分支已存在,基于其最新提交追加,sha:', base_sha[:10])

files = []
for root, dirs, names in os.walk(SRC):
    for nm in names:
        full = os.path.join(root, nm)
        rel = os.path.relpath(full, SRC).replace('\\', '/')
        files.append((rel, full))
files.sort()
print(f'待上传文件 {len(files)} 个')

tree_items = []
t0 = time.time()
for i, (rel, full) in enumerate(files, 1):
    raw = open(full, 'rb').read()
    b = api('POST', f'/repos/{OWNER}/{REPO}/git/blobs',
            {'content': base64.b64encode(raw).decode('ascii'), 'encoding': 'base64'})
    tree_items.append({'path': f'{PREFIX}/{rel}', 'mode': '100644', 'type': 'blob', 'sha': b['sha']})
    if i % 25 == 0 or i == len(files):
        print(f'  blob {i}/{len(files)}  用时 {time.time()-t0:.0f}s')

tree = api('POST', f'/repos/{OWNER}/{REPO}/git/trees',
           {'base_tree': base_sha, 'tree': tree_items})
commit = api('POST', f'/repos/{OWNER}/{REPO}/git/commits', {
    'message': 'docs: 新增梁子湖竣工图真实地理坐标定位验证成果(5图全部L1)\n\n'
               '- CGCS2000 3度带38(EPSG:4547)恒等变换确认,45处图内坐标注记亚毫米级一致\n'
               '- 18个影像对应点判读偏移<=4m,含独立检查点与跨图交叉验证\n'
               '- 原始DXF/PDF只读,未改动平台数据库',
    'tree': tree['sha'], 'parents': [base_sha]})
api('PATCH', f'/repos/{OWNER}/{REPO}/git/refs/heads/{BRANCH}',
    {'sha': commit['sha'], 'force': False})
print('推送完成:')
print(f'https://github.com/{OWNER}/{REPO}/tree/{BRANCH}/{PREFIX}')

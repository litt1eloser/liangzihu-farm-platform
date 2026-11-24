# M3-P0 公开 3D Tiles 测试样例登记

本目录只登记样例来源与许可；样例数据体积较大，**不纳入 Git 分发**，验收环境通过 `M3_SAMPLES_DIR` 环境变量指向本地样例目录（默认仓库根下 `.m3-samples/`，该目录已忽略）。

两套样例均为公开测试模型，**不是梁子湖实景、不与任何农场对象绑定**，仅用于验证三维管线能否加载真实世界规模的 3D Tiles 包。

## 样例 A：离散 LOD 龙（dragon）

- 来源：CesiumGS/3d-tiles-samples 仓库 `1.0/TilesetWithDiscreteLOD/`
  - https://github.com/CesiumGS/3d-tiles-samples/tree/main/1.0/TilesetWithDiscreteLOD
- 内容：斯坦福龙（Stanford Dragon）网格的三级抽稀，根/子/孙瓦片按屏幕空间误差逐级替换，用于验证离散 LOD 切换。
- 许可：该目录 README 标注 [CC0](https://creativecommons.org/share-your-work/public-domain/cc0/)（公共领域）。
- 文件清单（4 个，约 4.6 MB）：`tileset.json`、`dragon_low.b3dm`、`dragon_medium.b3dm`、`dragon_high.b3dm`。
- 放置位置：`$M3_SAMPLES_DIR/dragon/`。

## 样例 B：obj2tiles 多层瓦片（obj2tiles）

- 来源：bertt/cesium_3dtiles_samples 仓库 `samples/obj2tiles/`
  - https://github.com/bertt/cesium_3dtiles_samples/tree/master/samples/obj2tiles
- 内容：由 obj2tiles 工具从 OBJ 模型转换的多层 3D Tiles（LOD-0/1/2 共 45 个 b3dm），用于验证多瓦片树的逐级请求与缓存。
- 许可：仓库 `master/LICENSE` 为 MIT License。
- 文件清单（46 个，约 32 MB）：根 `tileset.json` + `LOD-0/`、`LOD-1/`、`LOD-2/` 下 45 个 `.b3dm`。
- 放置位置：`$M3_SAMPLES_DIR/obj2tiles/`。

## 使用方式

```bash
M3_SAMPLES_DIR=/data/wfx/m3-samples node --env-file=.env.test.local --import tsx --test tests/acceptance/m3-p0-terrain-samples-browser.test.ts
```

测试会把样例按私有上传链路（上传→组装→注册场景→校验）写入随机测试 schema，再经 `/api/v1/terrain/scenes/{id}/resources/...` 私有鉴权接口在真实浏览器（SwiftShader WebGL）中加载，验证 LOD、资源释放、三视口布局与「重置视角」。

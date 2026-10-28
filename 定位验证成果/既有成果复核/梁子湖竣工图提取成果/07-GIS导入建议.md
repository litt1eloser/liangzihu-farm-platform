# 梁子湖 GIS 试验导入建议（不修改现有生产数据库）

## 当前可用与不可用的边界

| 数据组 | 当前可做 | 暂不可做 |
| --- | --- | --- |
| A 级 67 条平整范围 | **可在隔离的本地 CAD 平面图中**叠图、检视编号、面积和编辑版本；可用于验证列表—选中—详情/面积等功能 | 不可放到真实天地图位置；不可直接定义为经营农田；不可当正式资产边界 |
| B 级道路、沟渠、田埂和施工边界 | 可以作为 GIS 导入流程的候选线/面，进行人工选认、合并分割和语义确认 | 不可将“图形条数”变成真实资产数量；不可自动求道路宽度或灌排关系 |
| C 级面、异常设施图块和不明用途区域 | 保留在待核实空间图层或 CSV 疑点清单 | 不可自动修复并入生产；不可直接绘制真实设备图标 |
| EPSG:4547 试验经纬度 | 可以用于**离线候选定位研究和对照** | 在完成外部控制点/影像验证之前，不可作为正式 geometry CRS 或 WGS84 发布 |

## 不急于改数据库，先用一层隔离的 GIS 数据契约

保留每条输入候选的：

`source_file_sha256`（原图哈希）→ `source_file` → `dxf_handle` → `source_layer` → `geometry_raw`（CAD 原坐标、CRS 未确认）→ `class_candidate` → `display_name_original` → `cad_area/cad_length` → `text_handle/text_excerpt` → `confidence_A_B_C` → `geo_status_L1_L4` → `verification_notes` → `geometry_revision`。

农业对象区分：`construction_boundary`、`land_leveling_area`、`field_management_boundary`、`field_ridge`、`pond_dredging_area`、`road_center_or_edge`、`channel_center_or_edge`、`hydraulic_facility_candidate`。不要直接把所有 `land_leveling_area` 自动生成 `field` 类型主数据。

本项目原有 `objects` / 边界版本 / `device_positions` / `source_crs` 已有较完整的权威边界与证据治理思路。图纸导入新产物应**先处于不可生产关联的隔离状态**，与原 `objects` 通过人工核验生成可撤销的候选对应；不应新增一套无条件自动生效的重复“地图设备”。

## 试验导入建议步骤

1. 使用 QGIS 打开 `09-提取的空间数据/CAD候选几何_坐标参考未知.gpkg`，包括面和线两个图层。**这些图层没有 CRS，不要替它们随手选择 EPSG:4326。** 可以先查看 CAD 原平面坐标与原图是否匹配。
2. 按 `cad_file`、`class`、`confidence` 过滤；优先测试 A 级土地平整施工范围列表与图面双向联动。`record_id` 或原始 `handle` 作为审计链接，另立内部 UUID，不把 handle 当跨文件全局唯一。
3. 人工核验语义和几何时新增一份修订几何，保留原始；形成 `reviewed_by`、`reviewed_at`、`review_basis`、`review_revision`。
4. 一旦拿到坐标说明/控制点，分别试算 CGCS2000 3°带、轴向和可能局部变换；必须用**独立检查点**验证残差，再保存已确认的 `source_crs` 和变换参数。
5. 只对空间定位达到 **L1**、实体身份及几何通过审核的数据，考虑建立与原 `objects`、边界版本、设备位置的正式关联，再由前端 OpenLayers 在正确坐标系上渲染。没有当前实体台账确认，点不直接成为真实设备。
6. 对 3D Cesium 未来有用的 Z/高程点，必须先核实高程基准和采集来源，不能因为图签写了 1985 就直接用作绝对高程表面。

## 原始三维点与设施符号的隔离使用

- `CAD原始测绘点_坐标与高程未确认.gpkg`：6,877 条带原始 Z 的 CAD `POINT`；在 QGIS 中可用于核查点的平面分布与 Z 值，但**未核实绝对 XY 坐标和 1985 高程基准的实际测量质量，不能直接插值成真实 DTM/DEM**。
- `设施图块位置候选_未核实.gpkg`：279 个 C 级 INSERT 插入点候选，代表**CAD 图块参照而非 279 台设备**。应作为诊断符号图层使用，不可写入 `device_positions`，更不可触发 IoT 控制。
- 对于 64 个插入点离群的块，查看 `设施图块与插入位置待核实.csv` 和 `06-可疑对象与待核实清单.csv`；需要针对原 DWG 以及块变换恢复位置，不应按邻近图形“自动吸附”。

## 导入文件说明

- `CAD候选几何_坐标参考未知.gpkg`：两个图层，`候选面` / `候选线`。**没有点图层**，因为现有异常块没有达到可验证的真实点位要求。
- `02-农业空间对象清单.csv`：源文件名、源图层、HANDLE、闭合/自交、可读名称、CAD 面积/长度、可信级别与疑点；仅保存紧凑属性，完整坐标留在 GPKG。
- `06-可疑对象与待核实清单.csv`：需人工处理的异常候选。
- `09-提取的空间数据/坐标解释候选试验.csv`：只用于投影试算，**没有导入许可**。

导入工作必须与当前正在使用的正式数据库隔离；本轮没有连接或修改正式农业库。

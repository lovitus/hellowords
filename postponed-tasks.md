# HelloWords 续开发清单

更新时间：2026-08-28（Asia/Singapore）

## 当前交付游标

- 公开版本：`v41-4e87ba6`
- 地址：<https://hellowords-world.perky-spoon-0500.chatgpt.site/?v=41-4e87ba6>
- 源码：`4e87ba6`（v41 公开运行时；衣柜词汇扩展）
- 当前工作批次：公寓、城市街景、厨房、卧室、浴室、科学馆、铁路站台、列车车厢、叶片、聚合物与衣柜密度；语义换词/索引闪现优化（已发布）。首页六块图集未重排，既有图像与锚点坐标保持不变。
- 子 agent：当前没有运行中的子 agent；历史审计、浏览器验收和 E2E 记录见本地忽略目录 `artifacts/codex-handoff-2026-08-12/README.md`。

## 未完成任务（按优先级）

1. **高密度场景批次**：除 `world-map` 外，多数场景仍只有约 22–49 个经过审核的锚点。`apartment` 107、`city-street` 89、`kitchen` 93、`bedroom` 83、`bathroom` 81、科学馆 96、铁路站台 71、列车车厢 64、叶片 49、聚合物 37、衣柜 56 已完成。接下来按 `docs/next-scene-batch.md` 继续逐场景制作明亮、可辨识的成品图，再从最终像素重新标注；不要用同义词、推断属性或重复部件填数。
   - 下一批候选：`plant-cell`；先复核最终像素再决定是否扩展。
   - 每个场景先做 portal 真值和 100%/200% 像素复核，再接入数据和导航。
2. **连续探索扩展**：保留根图集的滚轮/触控连续缩放和显式点击进入语义；只有在父子场景确实能共享同一张连续栅格时才增加反向 portal，不能恢复“滚轮误触即跳场景”。
3. **锚点与视觉耐久**：继续保持透明紧凑气泡、可读描边、稳定屏幕避让和真实物体位置；新场景必须有独立坐标审计，不能复制旧比例坐标。
4. **小问题观察**：E2E 日志仍偶发 `coffee-machine-premium-v1.jpg: Premature close` 的 Vite 静态流警告；目前不阻断验收，下一批发布前再判断是否需要修复资源服务或测试夹具。

## 每批验收门槛

- `npm run verify`
- `npm run test:e2e`
- `PERF_RUN=1 npm run test:perf`
- 真实公开地址的桌面/移动冒烟：根图集、一个显式 portal、场景词索引、缩放回退、无 console error。
- 记录准确的提交 SHA、Sites 版本/部署状态和 cachebuster URL；完成后更新本文件与本地 handoff README。
- v30–v36 真实公开冒烟：公寓进入后 39 个词首屏、107 个总词、5 个可点击区域；厨房区域聚焦到 scale 2.400、25 个词；城市街景进入后 89 个总词、6 个区域，交通枢纽聚焦到 scale 2.500、16 个词；厨房进入后 78 个词首屏、93 个总词、4 个区域，清洗区聚焦到 scale 2.300、31 个词；卧室进入后 76 个词首屏、83 个总词、5 个区域，衣柜储物区聚焦到 scale 3.000、17 个词；浴室进入后 76 个首屏、81 个总词、6 个区域，步入式淋浴聚焦到 scale 3.000、21 个词；科学馆进入后 24 个首屏词、96 个总词、5 个区域；铁路站台进入后 62 个首屏词、71 个总词、4 个区域，轨道结构聚焦到 scale 2.600、15 个词；公开页面均无浏览器日志。
- v41 真实公开冒烟：首页仍显示 1,275 个词与 105 个首屏锚点；沿公寓 → 卧室 → 衣柜进入后为 56 个总词、5 个区域，首屏显示 52 个词，白衬衫入口和新增衣物/配件词均可达，页面无浏览器日志。
- v41 回归证据：`npm run verify` 通过（215 个域测试），完整 E2E 88 通过 / 34 个设计性跳过，性能 2/2 通过；语义 1,013 词叶与本景词索引仍重复验证通过。

## 会话与临时文件边界

- 已清理 126 个无活动写锁的 HelloWords 子 agent/guardian JSONL（约 18.353 GiB），并保留当前根会话。
- 已清理 311 个明确属于 HelloWords/atlas 的 `/private/tmp` 路径（约 1.08 GiB）；约 196 MiB 的词汇源缓存已移入本地 handoff 的 `source-cache/`，可复现但不进入 Git。
- 旧的“评估当前项目”线程已归档，仍可恢复；其他项目的 sessions 未触碰。
- 精确首行 `cwd` 扫描显示 HelloWords 只剩当前根 JSONL。其他日志即使正文提到 HelloWords，只要归属 Gust、EasyTier 或其他项目，就必须保留。
- `/private/tmp` 当前约 11MB，未发现 HelloWords/atlas 命名残留；以后清理只针对有证据的项目路径，不能清空整个 tmp。
- 外置审计临时根中 17 份旧 HelloWords 发布压缩包及 v21 构建日志已移入系统废纸篓；源码、Sites 保存版本、审计 JSON 与词库源缓存仍保留。

## 续开发起点

```sh
cd /Volumes/micron512g/code/hellowords
git status --short --branch
git diff --check
npx tsx --test tests/domain/worldAtlasVisualContract.test.ts
```

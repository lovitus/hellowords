# HelloWords 续开发清单

更新时间：2026-08-28（Asia/Singapore）

## 当前交付游标

- 公开版本：`v29-eef9f62`
- 地址：<https://hellowords-world.perky-spoon-0500.chatgpt.site/?v=29-eef9f62>
- 源码：`eef9f627c784b35634c7cbbab441e41e8cd399d6`
- 工作区：`main`，当前无未提交改动。
- 子 agent：当前没有运行中的子 agent；历史审计、浏览器验收和 E2E 记录见本地忽略目录 `artifacts/codex-handoff-2026-08-12/README.md`。

## 未完成任务（按优先级）

1. **高密度场景批次**：除 `world-map` 外，多数 36 个场景仍只有约 22–49 个经过审核的锚点。按 `docs/next-scene-batch.md` 逐场景制作明亮、可辨识的成品图，再从最终像素重新标注；不要用同义词、推断属性或重复部件填数。
   - 第一批候选：`apartment-bright-v2`、`city-street-bright-v4`、`leaf-natural-v3`。
   - 第二批候选：`polymer`、`railway-platform`、`battery-pack`、`oxygen-molecule`、`hemoglobin`。
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

## 会话与临时文件边界

- 已清理 126 个无活动写锁的 HelloWords 子 agent/guardian JSONL（约 18.353 GiB），并保留当前根会话。
- 已清理 311 个明确属于 HelloWords/atlas 的 `/private/tmp` 路径（约 1.08 GiB）；约 196 MiB 的词汇源缓存已移入本地 handoff 的 `source-cache/`，可复现但不进入 Git。
- 旧的“评估当前项目”线程已归档，仍可恢复；其他项目的 sessions 未触碰。
- 精确首行 `cwd` 扫描显示 HelloWords 只剩当前根 JSONL。其他日志即使正文提到 HelloWords，只要归属 Gust、EasyTier 或其他项目，就必须保留。
- `/private/tmp` 当前约 11MB，未发现 HelloWords/atlas 命名残留；以后清理只针对有证据的项目路径，不能清空整个 tmp。

## 续开发起点

```sh
cd /Volumes/micron512g/code/hellowords
git status --short --branch
git diff --check
npx tsx --test tests/domain/worldAtlasVisualContract.test.ts
```


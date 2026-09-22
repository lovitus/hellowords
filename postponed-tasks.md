# HelloWords 续开发清单

更新时间：2026-08-31（Asia/Singapore）

## 当前交付游标

- 2026-09-22 用户已授权创建私有 GitHub 仓库，已建立 `https://github.com/lovitus/hellowords` 并接为 `origin`；原 Sites 远程不变。此前“缺少 GitHub 仓库”的阻塞已解除。会话功能、内容、域测试、桌面/手机回归与文档合并为一个完整候选批次，下一步由现有 CI 执行正确性、构建、E2E 与性能验收；结果未出前不发布新 Sites 版本。`.sites-runtime/` 明确忽略，避免把临时新站副本或发布归档带入仓库。
- 2026-09-22 会话批次续接：入口已移到场景右上角以避免手机顶栏溢出；语音能力检测改为打开时执行，组件卸载释放探索锁。新增 `tests/e2e/scene-conversations.spec.ts`，覆盖真实首页→街道→咖啡馆路径、12 句同屏组读、遮译、横向溢出、关闭保持镜头、Esc 与返回。`git diff --check` 通过；测试仅编写，尚未执行，不代表验收通过。唯一下一步：由用户指定 GitHub 仓库或授权创建私有仓库，接续已有 `.github/workflows/ci.yml` 运行整批验证；现有远程仅 `sites` / `sites-legacy`，不擅自建立源码外部副本。新站 v1 保持不变，本批未提交未发布。
- **当前唯一公开入口（2026-09-22）**：https://hellowords-explore.lilifenghao44444.chatgpt.site 。新站 v1 已成功部署（Sites `succeeded`）；源码 `b202808596f869876ced1b87209bf6a6ec1a3412`，版本 `appgprj_6ab219c32ef0819198d4d7facbfd9cdc~appgver_0431e2a444c481918443c39c96aeef2c`，部署 `appgdep_6ab21be4a96c8191829a621d18d044cb`。该提交仅变更新站身份，产品内容沿用已审核 `530f76c` 与保留构建。平台发布成功已验证，新域名的人工浏览器业务冒烟尚未执行，不冒充真实业务验收。主工作树已快进到新站提交并将新远程设为 `sites`，旧远程保留为 `sites-legacy`；以下 v142/冻结记录是历史基线，不再是当前发布目标。下一步：继续现有会话批次并确定 GitHub 验证仓库，未经整批验收不发布它。
- 2026-09-22 用户明确授权新建 Site：已创建 `appgprj_6ab219c32ef0819198d4d7facbfd9cdc`，slug `hellowords-explore`，访问模式已设为 public。新站独立工作树为 `.sites-runtime/new-site/`，从已审核 `530f76c` 克隆，原站 manifest/远程保持不变；当前只发布原审核源码及其保留构建，不包含主工作树尚未验收的会话功能。不要再次创建站点。新站发布成功与否以后续部署终态为准。
- 下一开发批次（未验收、未提交）：`app/domain/sceneConversations.ts` 与 `app/components/SceneConversation.tsx` 已添加 6 个现有场景、12 组原创双语会话、72 句表达，支持整组阅读、遮译与设备合成听读；已接 WorldApp，尚待静态检查/浏览器验收，不能宣称可发布。现无 GitHub remote，只有原 Sites remote，按用户新的 GitHub workflow 验证要求需先确定 GitHub 仓库，不擅自创建或公开源码。研究参考：https://h5p.org/node/464381 、https://learnenglish.britishcouncil.org/free-resources/speaking/a1 、https://react.dev/versions 。React 新版不会提供产品会话内容，本批不增依赖、不升级。
- 2026-09-22 发布续接：用户已明确允许审核完成后发布一次；候选提交 `530f76c`，工作树干净。Sites 发布工具现已可调用，但对 `.openai/hosting.json` 中原项目执行 `get_site` 返回 `NOT_FOUND / project_not_found`（404）。未创建新站、未替换项目 ID、未保存或部署新版本；需要恢复当前 Sites 连接对原项目的访问后，继续发布同一审核批次。此问题不代表原公开站已删除，也不能据此判断账户或工作区是哪一项有误。
- 公开版本：`v142-8e3cab7`（线上已完成真实冒烟）
- 地址：<https://hellowords-world.perky-spoon-0500.chatgpt.site/?v=142-8e3cab7#world>
- 公开源码仍冻结在 `8e3cab7039f684a434887faa76c6ba7c617ce8ea`；本地候选继续批量开发但不发布。当前已接入 88 个场景、13,348 个空间锚点、12,264 个去重展示词、577 个细分区、87 个门户、6 条首页分支；校园分支新增 School corridor → School dining hall（150 词/6 区）→ School catering kitchen（150 词/6 区）。餐厅入口来自走廊中央完整双开门；后厨入口来自餐厅供餐柜台后的完整厨房开口。两个新增场景均为 1600×900 固定 JPEG，入口、锚点和细分区已写入 `anchorAudit.status: "human-verified"`。
- 本地候选批次已完成 `npm run verify`（lint、typecheck、数据验证、322 个 domain 测试、28 个 semantic/lexical 测试、build、SSR 与 build analysis）、完整桌面/移动 E2E（196 通过/36 设计性跳过）、88 场景桌面/移动 runtime audit（2 通过/2 设计性跳过）、性能门（2/2），以及发布冻结检查（`npm run release:check` 按预期失败）。两次早期单命令 `verify:full` 曾被同工作树并发 Playwright/build 进程替换 `dist` 产物污染，表现为 `vinext start` 静态文件 ENOENT/connection refused；清理进程并隔离端口后实际产品逻辑门槛均通过。所有新增 300 个展示词均通过全 manifest 精确去重；终端场景继续放大保持原场景，不进入万词大图；首页仍只在悬浮分区时显示该区词。Hemodialysis unit 仍因缺少可信医院父入口而延期，不伪造空间连接；School catering kitchen 中央冷库门可作为下一批真实入口候选。
- 子 agent：继续固定复用内容 authoring 与集成复审角色，不新增第三位；本批复审发现的 4 个词汇准确性问题已在生成脚本中修复并重新生成，脚本二次运行 `sceneChanged: false`。历史审计、浏览器验收和 E2E 记录见本地忽略目录 `artifacts/codex-handoff-2026-08-12/README.md`。

### 发布冻结与万词里程碑（2026-08-30 用户要求）

- 停止按单场景、小修复或 agent 批次连续公开新版本；v142 保持为当前公开基线。开发期间只合并、测试和保留可恢复的本地产物，不调用 Sites 发布。
- 下一次公开发布只允许在用户明确要求预览，或“万词现实交互探索”候选版满足全部门槛后进行：至少 10,000 个去重展示词；词必须落在可见现实物体/区域的空间锚点上并可由首页沿门户进入，不以分类卡片、同义词、重复部件或纯语义列表填数；连续放大不能跳入万词列表，所有可进入层级可缩放或返回退出；首页维持仅悬浮分区显示该区词；统一通过数据、域/语义、完整桌面与移动 E2E、性能门和真实入口冒烟。
- 当前已接入的未发布里程碑为 12,264 个去重展示词，已跨过 10,000；共 88 个现实场景、13,348 个空间锚点、87 条可进入路径。校园批次现有九个真实校园分支场景，并由 Science preparation room 深入到 Science laboratory、School corridor 深入到 School dining hall 和 School catering kitchen；所有父入口均来自独立复核的清晰可见区域。Hemodialysis unit（150 词/6 区）保持为已审计待接入素材。仍冻结公开发布，后续继续整批扩充现实场景，由用户决定何时发布一个里程碑版本。
- 发布冻结现由 `.openai/RELEASE_FREEZE.md` 和 `npm run release:check` 双重记录：普通调用、未达到 10,000 词的里程碑调用、没有当前用户明确授权的预览调用，以及脏工作树都会直接失败；一次授权批次只允许产生一个公开版本。

### v140/v141 交付记录（2026-08-30）

- v140 首次公开学校批次：新增 `school-campus` 终端场景，73 个像素复核词、10 个细分区；世界地图新增第 5 个根入口。首次发布后发现移动端 Campus 分类热点被学校入口遮挡，改为同一校园面板内的安全矩形；随后又将入口调整为 `x600,y300,width200,height100`，通过亮度/深暗率门槛与首页移动端 hover 回归。
- v141 将上述学校入口修复与 Radiology suite 一起重新发布。Radiology 图像为 1600×900 RGB JPEG，87 个新词覆盖 CT bay、MRI bay、X-ray/mammography、control、ultrasound、preparation/supplies 六区；入口从 Hospital 的 CT/MRI 区进入，公开浏览器快照显示当前场景 87 词且细分区可聚焦。
- v141 本地验证：`npm run verify`（241 个域/语义测试）通过；完整 E2E 110 通过 / 36 设计性跳过；`PERF_RUN=1 npm run test:perf` 2/2；公开页真实冒烟无阻断错误。v140/v141 归档均已可恢复移动到 `/Users/fanli/.Trash/codex-session-cleanup-20260830/hellowords-v140/` 与 `/Users/fanli/.Trash/codex-session-cleanup-20260830/hellowords-v141/`。
- v142 新增两条实用分支：Airport → Baggage claim（95 词/5 区）与 Office building → Office service core（90 词/5 区）。图片、入口、去重、质量、域契约和桌面/移动 E2E 均通过；v142 归档已可恢复移动到 `/Users/fanli/.Trash/codex-session-cleanup-20260830/hellowords-v142/`。
- 视觉优化（气泡、线条、标题/小地图、放大抖动）暂不扩散改动；按用户当前优先级延期，避免阻塞场景和词汇增长。

### v122 交付记录（2026-08-29）

- 本地数据验证已通过：43 个场景、6,116 个空间锚点、5,202 个去重词、307 个细节区、42 个门户；`npm run verify`（231 个域测试 + 28 个语义/词境测试）已通过，完整 E2E 106 通过 / 36 设计性跳过，`PERF_RUN=1 npm run test:perf` 2/2 通过。
- 新增词批次：Hospital +150（科室/设施/疾病/药品）、Pathology lab +150（显微镜/标本/包埋/染色/病理显示）、Hospital pharmacy +120（INN/调配/自动柜/配制台）、Airport +120（值机/安检/登机厅/机坪）、Office building +120（前厅/办公位/会议室/设备核心）。每组均写入既有五级 LOD 与细节区，脚本 `scripts/add-professional-vocabulary.mjs` 可幂等复用。
- 相机交接修复：连续入口现在按 `object-fit: cover` 的真实子图像绘制边界计算，比例不一致的 Apartment 入口保持连续；公开页实际验证首页 6 名称/hover Campus 21 词/移出 0 词，医院 320、机场 270、写字楼 270 词以及细节区新词可达。
- 新增素材：`urban-services-overview-premium-v1.jpg`、`hospital-atrium-premium-v1.jpg`、`airport-terminal-premium-v1.jpg`、`office-atrium-premium-v1.jpg`、`pathology-lab-premium-v1.jpg`、`hospital-pharmacy-premium-v1.jpg`，均为 1600×900、已固定 SHA；素材由 ImageGen 生成后人工复核，未包含品牌/可读标牌。
- 医院命名依据 WHO ICD‑11（疾病/临床分类）与 WHO INN（通用药名）；机场术语依据 FAA/加拿大交通部门机场词汇；写字楼设施依据美国 HHS/GSA 与英国 Government Property Agency 的空间分类。参考：<https://www.who.int/standards/classifications/classification-of-diseases>、<https://www.who.int/teams/health-product-and-policy-standards/inn>、<https://tc.canada.ca/en/aviation/operating-airports-aerodromes/airport-signage-lexicon>、<https://www.hhs.gov/about/hhs-manuals/hhs-facilities-manual/glossary/index.html>、<https://portal.gpa.gov.uk/workplace-design-guide-support-zones/>。
- 已完成：整批一次提交（`28677a6`，包含 `7175b09` 相机交接修复），Sites v114 已公开部署并同步保存/部署游标，真实公开页按 City street → Transit hub → Urban services → Hospital/Airport/Office building 验证新词与细节区。
- 清理记录：v114 归档已移入 `/Users/fanli/.Trash/codex-session-cleanup-20260829/hellowords-v114/`；v111/v112/v113 归档已在同一可恢复废纸篓批次中，未删除当前根会话或共享临时根中的其他资料。
- v116 追加的布局优化先做屏幕外裁剪再做未来 LOD 探测，不改变五级 LOD、锚点坐标、碰撞与挂载上限；`npm run verify`、全量 E2E（106 通过 / 36 设计性跳过）和性能 2/2 均通过。公开页 v116 保持首页 6 名称、Campus hover 21/移出 0 词及医院 320 词。
- v117 追加 180 个城市/交通/科学馆/公园/社区花园词：city-street 149、transit-hub 103、science-museum 176、city-park 144、community-garden 103。对应细节区仍可点击，真实公开页已逐一核对词量。
- 清理记录：v117 归档已移入 `/Users/fanli/.Trash/codex-session-cleanup-20260829/hellowords-v117/`；活动 `.codex/sessions` 与其他项目临时文件未删除。
- v118 再增加 150 个专业设施词：医院手术室、病理冷藏、药房推车、机场行李提取、写字楼设备核心各 30 个；公开页已核对医院 350 词、病理 360 词及新细节区。
- 清理记录：v118 归档已移入 `/Users/fanli/.Trash/codex-session-cleanup-20260829/hellowords-v118/`；活动 `.codex/sessions` 与其他项目临时文件未删除。
- v119 在现有图片上增加 150 个 Home 词：Apartment 143、Kitchen 146、Bedroom 134、Bathroom 133、City cafe 100；新增批次统一落在 LOD 2–4，避免首屏挂载过多词泡，完整词量仍可通过细节区和拖动探索。
- v120/v121 增加焦点区词优先挂载，并在宽焦点区按词群包围盒自动降低初始目标缩放；点击 Kitchen 准备台时公开实测缩放降至 1.54，新增 `colander` 已挂载且可见，继续放大仍可进入更深 LOD。`npm run verify` 通过（230 个域测试 + 28 个语义/词境测试），完整 E2E 106 通过 / 36 设计性跳过，性能 2/2 通过。
- 清理记录：v119/v120/v121 归档已分别移入 `/Users/fanli/.Trash/codex-session-cleanup-20260829/hellowords-v119/`、`hellowords-v120/`、`hellowords-v121/`；活动 `.codex/sessions` 与其他项目临时文件未删除。
- v122 为交通链再增加 150 个细节词，并让当前焦点区的 LOD4 词在目标缩放后直接提升为可读状态；公开实测 Kitchen 准备台 scale 1.54，`colander` 已挂载且可见，Battery pack 的 `cooling plate fin` 已可见。
- 清理记录：v122 归档已移入 `/Users/fanli/.Trash/codex-session-cleanup-20260829/hellowords-v122/`；活动 `.codex/sessions` 与其他项目临时文件未删除。
- v123 在五个医疗科学场景各增加 30 个结构词：Blood cell 91、Heart 91、Human body 90、Hemoglobin 81、Oxygen molecule 90；词汇均落在既有审计图像与细节区，不引入诊疗建议或不可见过程。
- v123 修复紧凑视口从深层区块切换到宽区块时的焦点丢词：区块点击允许最多半级回缩以容纳完整词群，并让当前焦点词优先获得安全标签槽；公开发布前已跑完整 E2E（106 通过 / 36 设计性跳过）与性能门（2/2）。
- v124 批次在既有五张设施图上再增加 150 个词：Hospital 380、Pathology lab 390、Hospital pharmacy 330、Airport 330、Office building 330；同步更新证据上限与文档。
- v124 已完成公开发布：五个设施场景各增加 30 个词，完整校验通过（232 个域测试），整套 E2E 106 通过 / 36 设计性跳过，性能门 2/2 通过。
- v125 让医院、病理、药房、机场、写字楼的焦点区在桌面与移动端都优先占用可读槽位，并为医院 `defibrillator` 增加公开路径断言；公开冒烟确认首页 6 大区/0 词、Campus 21/移出 0，医院 380、病理 390、药房 330、机场 330、写字楼 330，新词焦点可见且无 error/warn 日志。
- 清理记录：v124/v125 归档已分别移入 `/Users/fanli/.Trash/codex-session-cleanup-20260829/hellowords-v124/` 与 `/Users/fanli/.Trash/codex-session-cleanup-20260829/hellowords-v125/`；当前 `.codex/sessions` 与共享临时根未删除。
- v126 批次在 City street、Transit hub、Science museum、City park、Community garden 各增加 30 个可见结构词（共 150）；替换了池塘图中无法确认的鱼类/昆虫词，保留桥梁、睡莲、鸭与岸线部件，并同步更新证据上限与词量契约。
- v126 已完成公开发布：完整校验通过（232 个域测试 + 28 个语义测试），整套 E2E 106 通过 / 36 设计性跳过，性能门 2/2；公开冒烟确认首页 6 大区/0 词、Campus 21/移出 0，以及城市街景、交通枢纽、科学馆、公园、社区花园各自新增词可读且无 error/warn 日志。
- 清理记录：v126 归档已移入 `/Users/fanli/.Trash/codex-session-cleanup-20260829/hellowords-v126/`；当前 `.codex/sessions` 与共享临时根未删除。
- v127 批次在五张设施图上再增加 150 个词：影像室、染色台、配药台、登机厅与会议室各 30 个；全部复用现有可见区域与五级 LOD，不改变门户几何。
- v127 已完成公开发布：完整校验通过（232 个域测试 + 28 个语义测试），整套 E2E 106 通过 / 36 设计性跳过，性能门 2/2；公开冒烟确认首页 6 大区/0 词、Campus 21/移出 0，五个设施新增词均可读且无 error/warn 日志。
- 清理记录：v127 归档已移入 `/Users/fanli/.Trash/codex-session-cleanup-20260829/hellowords-v127/`；当前 `.codex/sessions` 与共享临时根未删除。
- v128 在五个 Home 场景增加 150 个可指认生活部件：Apartment 173、Kitchen 176、Bedroom 164、Bathroom 163、City cafe 130；词汇仍复用已有房间、柜体与设备细分区。
- v129 将 Home 焦点区词优先挂载，并把 Bedroom 的新增词收回衣柜可见结构；完整校验、E2E 106/36 与性能门 2/2 通过。
- v130 依据 Apartment bright v2 最终像素重新锚定客厅词（sofa leg、sofa cushion、coffee table、media cabinet handle 等），修正配图不符词；完整校验、E2E 106/36 与性能门 2/2 通过，公开 v130 已真实冒烟。
- v131 在五张已审计设施图上再增加 150 个词：operating theatre、cold storage、compounding bench、baggage claim、office pantry 各 30 个；`npm run verify` 232 个域 + 28 个语义、E2E 106/36、性能 2/2 均通过，公开页真实核对五个新词与总量，error/warn 日志为空。
- 清理记录：v128、v129、v130、v131 归档已分别移入 `/Users/fanli/.Trash/codex-session-cleanup-20260829/hellowords-v128/`、`/Users/fanli/.Trash/codex-session-cleanup-20260829/hellowords-v129/`、`/Users/fanli/.Trash/codex-session-cleanup-20260829/hellowords-v130/`、`/Users/fanli/.Trash/codex-session-cleanup-20260829/hellowords-v131/`；活动 `.codex/sessions` 与共享临时根不删除。
- v132 在五张已审计园艺/植物图上再增加 150 个词：greenhouse structure、tomato leaf、potting tools、raised-bed crops、oak-leaf surface 各 30 个；`npm run verify` 232 个域 + 28 个语义、E2E 106/36、性能 2/2 均通过，公开页真实核对花园、温室、番茄、工作台、叶片新词，error/warn 日志为空。
- 清理记录：v132 归档已移入 `/Users/fanli/.Trash/codex-session-cleanup-20260829/hellowords-v132/`；活动 `.codex/sessions` 与共享临时根不删除。
- v133 在交通枢纽和 Leaf 两张已审计图上再增加 60 个词；`npm run verify` 232 个域 + 28 个语义、E2E 106/36、性能门曾通过 2/2，公开页真实核对中央大厅与 Leaf 新词，error/warn 日志为空，未改变门户几何。
- 稳定性记录：未发布的 canonical-slot 实验在同一 macOS 性能门连续出现 75.05–76.92ms（预算 75ms），因此已恢复并公开 v133 原过渡候选实现；下一批先用真实公开回归再调整。
- v134 只改桌面标签候选裁剪（compact 仍为 18px、desktop 为 72px），新增边缘锚点单元合同；`npm run verify` 通过（233 个域测试 + 28 个语义），性能门 2/2 通过，定向 E2E（City park、label retention、scene minimap）通过。完整并行 E2E 最新一次为 103 通过 / 36 跳过，3 个移动端深层词可见性项仍有既有时序失败，保留失败截图，不包装为全绿。
- 清理记录：v134 归档已移入 `/Users/fanli/.Trash/codex-session-cleanup-20260829/hellowords-v134/`；活动 `.codex/sessions` 与共享临时根不删除。
- v135 将 `focusedDetailZoneValueRef` 在细分区点击事件中同步到最新 zone，再启动相机动画；新增 source-contract 单测，`npm run verify` 通过（233 个域测试 + 28 个语义），完整 E2E 106/36、性能 2/2 通过，公开页医院 Clinical reference 的 `diagnosis` 可见且浏览器日志为空。
- 清理记录：v135 归档已移入 `/Users/fanli/.Trash/codex-session-cleanup-20260829/hellowords-v135/`；活动 `.codex/sessions` 与共享临时根不删除。
- v136 将桌面空间词泡背景透明度从 64% 降到 56%、边框从 64% 降到 58%，并更新 CSS 合同；`npm run verify` 通过（234 个域测试 + 28 个语义），完整 E2E 106/36、性能 2/2 通过，公开 Apartment 画面实测 `--label-surface-opacity: 56%`、error/warn 日志为空。
- 清理记录：v136 归档已移入 `/Users/fanli/.Trash/codex-session-cleanup-20260829/hellowords-v136/`；活动 `.codex/sessions` 与共享临时根不删除。
- v137 在四张已审计园艺/交通图上加入 47 个显式像素锚定部件词：Transit hub +12、Potting workbench +12、Greenhouse interior +11、Leaf +12；同步更新细分区计数与温室/工作台证据上限。`npm run verify` 通过（234 个域测试 + 28 个语义），完整 E2E 106/36、性能 2/2 通过；公开页实测四个新增细分区各自可读新词，error/warn 日志为空。术语复核参考 FTA 交通设施词汇与 USDA/ARS 温室育苗资料：<https://www.transit.dot.gov/sites/fta.dot.gov/files/docs/ntd/58026/2017-glossary.pdf>、<https://www.ars.usda.gov/research/publications/publication/?seqNo115=140158>。
- 清理记录：v137 归档已移入 `/Users/fanli/.Trash/codex-session-cleanup-20260830/hellowords-v137/`；活动 `.codex/sessions` 与共享临时根不删除。

## 当前续开发游标（2026-08-29）

- 活跃根任务：`019fe5fe-faec-7070-9788-dbe33e98e645`（当前对话，保留）。没有运行中的协作 agent。
- 已归档的完成子任务：`01a04618-091d-7a63-bf16-a78fd56aab74`，主题为“修复场景切换与首页展示”；它的代码曾被明确撤销，当前只保留本批工作树中的新改动。
- 2026-08-28 清理后续：city-park 88 词、oak-tree 68 词、heart 61 词、dinosaur-hall 69 词、pond-edge 65 词、frog 59 词、blood-cell 61 词与 rail-bogie 65 词批次均已完成 validator、unit/docs、构建、公开部署和真实冒烟；v66 已恢复首页“仅悬浮大区显示锚点词、其余只显示名称”的交互；v67 将 battery 从 32 扩至 42 个可指认部件；v68 将 electric-bus 从 40 扩至 51 个可指认部件；v69 缓和空间滚轮步长和回退边界；v70 收紧小地图保护区；v71 让碰撞后的避让方向优先走邻近中间槽位；v72 将 human-body 从 40 扩至 60 个可指认部件；v73 将 coffee-machine 从 40 扩至 60 个可指认部件；v74 修正泵壳与水泵的同点覆盖；v75 将 lithium-ion-cell 从 31 扩至 46 个可指认部件；v76 让碰撞换槽位仅在大跳位做 140ms 过渡；v77 收紧桌面词泡、增强描边；v78 将 water-tank 从 36 扩至 50 个可指认部件；v79 将 cotton-shirt 从 40 扩至 55 个可指认部件；v80 拆分棉衬衫底部小地图区域；v81 拆分 Apartment 楼梯上下区域并完成公开冒烟；v92 将 wardrobe-interior 从 56 扩至 60 个可指认部件；v93–v95 将 battery 从 42 扩至 60 个可指认部件并拆分上盖与电源端子焦点区；v96–v99 将 lithium-ion-cell 从 46 扩至 60 个可指认部件并拆分端子与展开层焦点区；v100–v101 将 water-tank 从 50 扩至 61 个可指认部件并拆分盖角、水面、滤网杯与底座焦点区；v102–v103 将 plant-cell 从 46 扩至 60 个可指认部件并拆分细胞核/内质网、类囊体、线粒体和细胞壁焦点区；v104 将 oxygen-molecule 从 26 扩至 60 个可指认部件并修复 Hemoglobin 氧分子入口被小地图挡住的问题；v105 将 Hemoglobin 从 22 扩至 51 个可指认部件并拆分亚基、血红素、配位口袋焦点区；v106 将 Polymer 从 39 扩至 60 个可指认部件并拆分薄膜/片层/缺陷/分子链探索区；v107 将 science-museum 从 121 扩至 146 个可指认部件并保留恐龙馆/人体入口，完成公开部署。下一批继续先复核最终像素，再接入数据和导航。
- 活跃任务复核：HelloWords 根任务仍为 `active`；另一个独立的 MDD 根任务 `01a00e7d-e878-7dd2-978b-3ab09d25c932` 也在运行，工作目录为 `/Volumes/micron512g/tmp-project/mdd-gateway`，本次未触碰；当前没有协作子 agent。
- v82 已修复场景小地图聚焦偏移：非根场景的每个 detail zone 现在以其真实 `labelIds` 锚点包围盒中心作为 focus 坐标，无锚点时才回退到区域几何中心；首页回归测试锁定“默认 0 词、悬停仅当前大区、移出 0 词”的交互契约。`npm run verify` 通过（223 个域测试），全量 E2E 91 通过 / 35 个设计性跳过；性能门首次并行测量为 76.65ms（预算 75ms）的临界抖动，聚焦重跑通过（1/1）。公开 v82 冒烟确认首页 6 个分区名、Campus 悬停 21 词并移出归零；Apartment 楼梯入口/踏步分别以 scale 2.35 聚焦，公开页无 error/warn 日志。
- v83 将相同的真实锚点包围盒聚焦规则覆盖到根图集的六大区和 66 个根图集细节块；`science-utilities` 这类横向大块不再落到空白几何中心。新增端到端断言核对其 focus 坐标，`npm run verify`、全量 E2E（91 通过 / 35 个设计性跳过）和性能 2/2 均通过。公开 v83 冒烟确认 `Science → Building utilities` 在 scale 3.2 将词群中心误差压到 0.01px，首页悬停仍为 21/0，公开页无 error/warn 日志。
- v84 基于同一张 Apartment bright v2 原图补回 6 个二次复核后仍清晰可指认的部件：sofa arm、chair seat、drawer、bathtub faucet、shower drain、wall niche；Apartment 从 107 增至 113 个锚点，分别加入客厅/厨房/浴室细节区，未恢复此前排除的 sink、hallway、dresser。`npm run verify` 通过（224 个域测试），全量 E2E 91 通过 / 35 个设计性跳过，性能 2/2 通过。公开 v84 冒烟确认客厅 33 词、厨房 26 词、浴室 24 词和新增词均可见，首页仍为 6 名称/0 词泡，公开页无 error/warn 日志。
- v85 将同一张列车车厢 bright v2 原图的可指认部件从 64 增至 70：buffer、brake hose、sleeper、door seal、window pane、wall panel；原有转向架入口和既有锚点保持不变。`npm run verify` 通过（225 个域测试），全量 E2E 92 通过 / 36 个设计性跳过，性能聚焦复跑通过；公开 v85 初步冒烟确认 70 个词和新词可达。
- v86 将列车车厢原横跨全宽的底架/轨道词群拆为车厢壳体、底架设备、车钩制动和前景轨道四个独立焦点区，并新增 train-carriage E2E 合同；公开 v86 复查发现车钩区仍需避开上方 gangway，保留为后续 v88 修正证据。
- v87 将车钩区目标缩放从 2.6 调到 2.8，但公开复查仍显示 brake hose 被上方 gangway 的包围盒挤出，未把 v87 作为最终可读交付。
- v88 将车钩区重新裁为下方 coupler/buffer/brake hose/boarding step 四锚点，并把 gangway 回归车厢壳体区；公开 v88 在 scale 2.8 同时读到 buffer、brake hose、boarding step，前景轨道区同时读到 sleeper、rail baseplate、rail fastener。`npm run verify` 通过（225 个域测试），全量 E2E 92 通过 / 36 个设计性跳过，性能 2/2 通过；公开首页仍为 6 名称/0 词泡，页面无 error/warn 日志。
- v89 扩大连续放大时的中间避让候选：从旧槽位到最近 8 个合法方向各尝试两段过渡，仍保留原碰撞和屏幕边界约束。Apartment 本地 8 步测量的最大偏移从约 147px 降到约 88px；新增回归只统计未被显式标记为过渡的跳位并要求 ≤120px。`npm run verify` 通过（225 个域测试），全量 E2E 92 通过 / 36 个设计性跳过，性能 2/2 通过；公开 v89 首页 6 名称/0 词泡，列车车厢车钩区与轨道区细节保持可见，页面无 error/warn 日志。
- v90 基于同一张 electric-bus bright v2 原图补充 4 个明确部件：door frame、door window、door hinge、wheel lug；电动公交从 51 增至 55 个锚点，分别加入前门与前轮细节区，未恢复 driver、passenger、route number 等排除概念。`npm run verify` 通过（225 个域测试），全量 E2E 92 通过 / 36 个设计性跳过，性能 2/2 通过。公开 v90 冒烟确认前门区 scale 2.55 同时显示 3 个新增词、前轮区 scale 3.1 显示 wheel lug，首页仍为 6 名称/0 词泡，页面无 error/warn 日志。
- v91 基于同一张 polymer bright v2 原图补充 2 个半结晶形貌词：crystallite 与 lamellar stack；Polymer 从 37 增至 39 个锚点，均回挂到半结晶细节区，未恢复 repeating unit、side group、molecular weight 等审计排除。`npm run verify` 通过（225 个域测试），全量 E2E 92 通过 / 36 个设计性跳过，性能 2/2 通过。公开 v91 冒烟确认半结晶区 scale 2.2 同时显示 lamella、crystallite、lamellar stack、spherulite，首页仍为 6 名称/0 词泡，页面无 error/warn 日志。
- v92 基于同一张 wardrobe-interior premium v2 原图补充 4 个清晰部件：window sill、door panel、jacket cuff、trouser leg；衣柜从 56 增至 60 个锚点，分别回挂到日光角落、柜体结构和悬挂衣物细节区，既有白衬衫入口与原有锚点保持不变。`npm run verify` 通过（225 个域测试），全量 E2E 92 通过 / 36 个设计性跳过，性能 2/2 通过。公开 v92 冒烟确认首页 6 个分区名、默认 0 词，悬停 Campus 仅显示该区 21 词并移出归零；Apartment → Bedroom → Wardrobe interior 可达 60 个词及新增部件；页面无 error/warn 日志。
- v93–v95 基于同一张 battery-premium-v2 原图补充 18 个清晰部件：cell can、module end plate、cable gland、terminal lug、coolant tube、lid port、lid recess、cell terminal stud、cell holder rib、module side wall、wire loom、tube retainer、coolant tee、front wall bolt、flange bolt、mounting tab、vent mesh、connector lock；电池包从 42 增至 60 个锚点，最终六个细节区分别为 9/5/17/12/4/13，并将上盖与电源端子拆成独立焦点，原有锂离子电芯入口与锚点保持不变。`npm run verify`、全量 E2E 92 通过 / 36 个设计性跳过、性能 2/2 均通过；公开 v95 冒烟确认新增上盖、端子和电芯词可达，首页悬浮契约无回归，页面无 error/warn 日志。
- v96–v99 基于同一张 lithium-ion-cell-premium-v2 原图补充 14 个清晰部件：positive terminal seal、negative terminal seal、fill-port collar、cover lip、winding outer turn、core wall、case side rail、positive tab root、negative tab root、separator fold、electrode fold、vent screen、collector edge、case lip；电芯从 46 增至 60 个锚点，最终七个细节区分别为 11/5/4/12/14/10/4，并将正负端子与展开层边缘拆成独立焦点，原有终点场景和锚点保持不变。`npm run verify`、全量 E2E 92 通过 / 36 个设计性跳过、性能 2/2 均通过；公开 v99 冒烟确认正负端子、折叠边缘和首页悬浮契约均可达，页面无 error/warn 日志。
- v100–v101 基于同一张 water-tank-premium-v1 原图补充 11 个清晰部件：lid corner、hinge leaf、filter cup、latch housing、surface ripple、bottom rail、front corner post、condensation streak、lid channel、base bracket、left rubber foot；水箱从 50 增至 61 个锚点，最终九个细节区分别为 12/5/7/4/10/10/4/4/4，并将上盖右角、水面、滤网杯和底座支架拆成独立焦点，原有 Polymer 入口与锚点保持不变。`npm run verify`、全量 E2E 94 通过 / 36 个设计性跳过、性能 2/2 均通过；公开 v101 冒烟确认上盖、水面、滤网杯、底座词可达，首页悬浮契约无回归，页面无 error/warn 日志。
- v102–v103 基于同一张 plant-cell-premium-v2 原图补充 14 个清晰部件：rough ER sheet、Golgi stack、cytoskeleton bundle、ribosome cluster、vacuole edge、thylakoid membrane、smooth ER branch、nucleolar core、Golgi cisterna edge、granum edge、crista tip、nuclear envelope fold、chloroplast inner membrane、cell wall junction；植物细胞从 46 增至 60 个锚点，八个细节区分别为 14/8/12/7/5/4/4/6，并将类囊体堆、上壁连接、线粒体和原有核/内质网区域拆成独立焦点。`npm run verify`、全量 E2E 96 通过 / 36 个设计性跳过、性能 2/2 均通过；公开 v103 冒烟确认首页默认 6 名称/0 词泡、Campus 悬停仅 21 词且移出归零，City park → Oak tree → Leaf → Plant cell 的 60 词路径及四个新增焦点词可达，页面无 error/warn 日志。
- v104 基于同一张 oxygen-molecule-premium-v2 原图补充 34 个清晰部件：alveolar network、airway branch、alveolar opening、capillary network、respiratory membrane、capillary loop、bronchiole lumen、bronchiolar wall、airway ring、alveolar sac lumen、alveolar pore、alveolar lining、capillary wall、capillary branch、plasma space、red blood cell cluster、septal ridge、alveolar surface、macrophage cytoplasm、endothelial nucleus、endothelial junction、oxygen pair、red cell dimple、capillary endothelium、alveolar wall seam、capillary lumen edge、plasma pocket、red cell rim、hemoglobin cluster、carbon atom、alveolar cell nucleus、macrophage granule、alveolar pore edge、oxygen bond axis；氧分子场景从 26 增至 60 个锚点，拆出 capillary-wall-detail 与 erythrocyte-detail，五级密度为 12/18/12/11/7。新增门户层级保护只在真实入口矩形与小地图重叠时解除 viewer-shell 绘制隔离，保持小地图控件可用。`npm run verify`、全量 E2E 98 通过 / 36 个设计性跳过、性能 2/2 均通过；公开 v104 冒烟确认首页默认 6 名称/0 词泡、Campus 悬停仅 21 词且移出归零，Hemoglobin → Oxygen molecule 入口可直接点击，氧分子 60 词及五个焦点区新增词可达，页面无 error/warn 日志。
- v105 基于同一张 hemoglobin-premium-v2 原图补充 29 个清晰部件：alpha beta dimer、heme array、globin assembly、heme center、helix bundle、globin core、ribbon surface、subunit cleft、alpha beta interface、red cell rim、heme plane、porphyrin edge、ring nitrogen、histidine ring、imidazole ring、distal pocket、proximal pocket、surface loop、heme edge、oxygen ligand、coordination site、ribbon strand、chain bend、subunit contact、globin loop、protein cleft、porphyrin nitrogen、oxygen sphere、histidine side chain；Hemoglobin 从 22 增至 51 个锚点，新增 heme-architecture、oxygen-coordination、histidine-pocket 焦点区并保留唯一 Oxygen molecule 入口。`npm run verify`、全量 E2E 98 通过 / 36 个设计性跳过、性能 2/2 均通过；公开 v105 冒烟确认首页默认 6 名称/0 词泡、Campus 悬停仅 21 词且移出归零，Hemoglobin 51 词路径和氧分子入口可达，页面无 error/warn 日志。
- v106 基于同一张 polymer-premium-v2 原图补充 21 个清晰部件：polymer assembly、material cross section、fiber mat、film roll、pellet cluster、molded corner、crystalline lamella、spherulite ray、lamella edge、interlamellar region、amorphous pocket、filler surface、pore rim、tie molecule、chain junction、backbone bend、fracture branch、cross-link node、chain segment、crack branch、molecular loop；Polymer 从 39 增至 60 个锚点，四个细节区分别扩至 18/16/10/15 个词，`npm run verify`、全量 E2E 100 通过 / 36 个设计性跳过、性能 2/2 均通过；公开 v106 冒烟确认首页默认 6 名称/0 词泡、Campus 悬停仅 21 词且移出归零，Polymer 60 词及四个新增焦点词可达，页面无 error/warn 日志。
- v107 基于同一张 science-museum-bright-v3 原图补充 25 个清晰部件：vertebra、pelvic bone、shoulder blade、limb bone、tooth row、telescope tube ring、mounting knob、planetary ring、panel grid、globe meridian、focus knob、condenser、stage plate、robot link、tool flange、base column、ammonite chamber、crystal facet、gyroscope axle、prism edge、pendulum string、rainbow band、anatomy leg、anatomy foot、pedestal step；科学馆从 121 增至 146 个锚点，五个展区分别为 26/31/29/43/17 词，`npm run verify`、全量 E2E 102 通过 / 36 个设计性跳过、性能 2/2 均通过；公开 v107 冒烟确认首页默认 6 名称/0 词泡、Campus 悬停仅 21 词且移出归零，科学馆 146 词、五个焦点区和恐龙馆/人体入口可达，页面无 error/warn 日志。
- v43 已提交并公开发布：`app/components/SceneViewport.tsx`、`app/components/WorldApp.tsx`、`app/globals.css` 与相关 E2E 契约已冻结。`world-map` 默认隐藏密集词云，六大类透明点击区可打开完整词表；分类词进入词卡时地图层自动收起；场景过渡期间旧标签/交互层隐藏；根图像和既有锚点坐标未改动。
- v44 已基于 `chloroplast-interior-premium-v3.jpg` 的最终像素审计扩展 15 个可指认结构，叶绿体从 36 增至 51 个词、6 个细节区；不加入 Calvin cycle、Rubisco 等不可直接指认的过程。
- v44 验收证据：`npm run verify`、单 worker 全量 E2E（88 通过 / 34 设计性跳过）、`PERF_RUN=1 npm run test:perf` 均通过；公开路径进入叶绿体后可见 51 个总锚点、6 个细节区，Grana 区显示 15 词，腔与蛋白区显示 19 词。
- v45 已基于 `city-park-bright-v2.jpg` 的最终像素审计扩展 24 个可指认结构，城市公园从 39 增至 63 个词；池塘/桥、喷泉/凉亭、橡树/长椅、雏菊/野餐等细节区保留独立锚点，未恢复被审计删除的活动或推断词。
- v45 验收证据：`npm run verify`、全量 E2E（88 通过 / 34 设计性跳过）、`PERF_RUN=1 npm run test:perf` 均通过；公开首页 6 大类仍可用，城市公园首屏 53 词，池塘区和前景区新增词可达。
- v46 已基于 `science-museum-bright-v3.jpg` 的最终像素审计扩展 25 个可指认部件，科学馆从 96 增至 121 个词；恐龙、望远镜、显微镜、机械臂、化石/矿物、物理展项、DNA/人体模型均保留具体部件，未恢复角色、场馆、商店或标牌推断。
- v46 验收证据：`npm run verify`、全量 E2E（88 通过 / 34 个设计性跳过）、`PERF_RUN=1 npm run test:perf` 均通过；公开路径进入科学馆后 5 个细节区可达，Dinosaur gallery、Microscopy and robotics、Life science alcove 均显示新增词。
- v47 已基于 `kitchen-premium-v3.jpg` 的最终像素审计扩展 23 个可指认部件，厨房从 93 增至 116 个词；同时把 warm 连续入口交接节奏固定到 150ms，避免短帧竞争造成“跳过”感。
- v47 验收证据：`npm run verify`、全量 E2E（88 通过 / 34 个设计性跳过）、`PERF_RUN=1 npm run test:perf` 均通过；公开厨房首屏 33 词，清洗区 38 词、烹饪墙 27 词、咖啡角 15 词可达。
- v48 已基于 `bathroom-premium-v1.jpg` 的最终像素审计扩展 22 个可指认部件，浴室从 81 增至 103 个词；窗、浴缸、盥洗台、马桶、淋浴玻璃、壁龛、排水与毛巾收纳均保留具体部件，未加入湿度/清洁度等推断。
- v48 验收证据：`npm run verify`、全量 E2E（88 通过 / 34 个设计性跳过）、`PERF_RUN=1 npm run test:perf` 均通过；公开浴室六个细节区可达，浴缸区、马桶区、淋浴区和毛巾收纳均显示新增词。
- v49 已基于 `bedroom-premium-v2.jpg` 的最终像素审计扩展 21 个可指认部件，卧室从 83 增至 104 个词；床品褶皱、书桌/椅子、窗与灯具、衣柜收纳、洗衣篮编织纹和地板细节均保留，衣柜入口未被遮挡。
- v49 验收证据：`npm run verify`、全量 E2E（88 通过 / 34 个设计性跳过）、`PERF_RUN=1 npm run test:perf` 均通过；公开路径从首页进入 Apartment → Bedroom，五个细分区显示 28/19/14/37/5 词，场景词索引可定位 pillow seam、artwork frame、garment sleeve、wardrobe hinge、floor plank 等新增词，返回首页后六大类入口仍可用，公开页无 error/warn 日志。
- v50 已基于 `railway-platform-premium-v2.jpg` 的最终像素审计扩展 25 个可指认部件，铁路站台从 71 增至 96 个词；站台铺面/缘石、钟与长椅、行李、车门/车顶、车头运行部件、受电弓和轨道床细节均保留，完整列车入口未被遮挡。
- v50 验收证据：`npm run verify`、全量 E2E（88 通过 / 34 个设计性跳过）、`PERF_RUN=1 npm run test:perf` 均通过；公开路径从首页进入 City street → Transit hub → Railway platform，四个细分区显示 34/30/11/21 词，场景词索引可定位 platform tile、roof vent、mast crossarm、rail baseplate 等新增词，返回首页后 1,275 词首页入口仍可用，公开页无 error/warn 日志。
- v51 已基于 `transit-hub-premium-v2.jpg` 的最终像素审计扩展 25 个可指认部件，交通枢纽从 48 增至 73 个词；铁路月台、中央大厅、公交车位和出行设施的钟、扶梯、闸机、植物、行李车、列车、公交和充电部件均保留，两条真实交通入口未被遮挡。
- v51 验收证据：`npm run verify`、全量 E2E（88 通过 / 34 个设计性跳过）、`PERF_RUN=1 npm run test:perf` 均通过；公开路径从首页进入 City street → Transit hub，四个细分区显示 18/36/11/8 词，场景词索引可定位 route line、plant leaf、bus headlight、floor tile 等新增词，返回首页后 1,275 词首页入口仍可用，公开页无 error/warn 日志。
- v52 已基于 `city-cafe-premium-v2.jpg` 的最终像素审计扩展 25 个可指认部件，城市咖啡馆从 45 增至 70 个词；门窗、桌椅/卡座、柜台与展示柜、意式咖啡机、餐具和空白菜单边框均保留，不加入人物、品牌或服务推断。
- v52 验收证据：`npm run verify`、全量 E2E（88 通过 / 34 个设计性跳过）、`PERF_RUN=1 npm run test:perf` 均通过；公开路径从首页进入 City street → City cafe，五个细分区显示 6/22/15/15/12 词，场景词索引可定位 door panel、display glass、portafilter handle、sugar bowl lid、menu frame 等新增词，返回首页后 1,275 词首页入口仍可用，公开页无 error/warn 日志。
- v53 已基于 `community-garden-premium-v1.jpg` 的最终像素审计扩展 25 个可指认部件，社区花园从 48 增至 73 个词；温室、种植床、工作台、堆肥站、雨水收集、软管和花带的具体结构均保留，两条真实子入口未被遮挡。
- v53 验收证据：`npm run verify`、全量 E2E（88 通过 / 34 个设计性跳过）、`PERF_RUN=1 npm run test:perf` 均通过；公开路径从首页进入 Community garden，七个细分区显示 6/13/12/13/11/10/8 词，场景词索引可定位 greenhouse roof ridge、bench surface、tap handle、sunflower center、butterfly wing 等新增词，返回首页后 1,275 词首页入口仍可用，公开页无 error/warn 日志。
- v54 已基于 `potting-workbench-premium-v1.jpg` 的最终像素审计扩展 25 个可指认部件，园艺工作台从 49 增至 74 个词；工作台边缘、浇水器具、育苗格、花盆口沿、工具刃口、番茄支撑、下层储物和筛网细节均保留，场景保持终点无入口。
- v54 验收证据：`npm run verify`、全量 E2E（88 通过 / 34 个设计性跳过）、`PERF_RUN=1 npm run test:perf` 均通过；公开路径从首页进入 Community garden → Potting workbench，七个细分区显示 11/9/16/14/9/8/5 词，场景词索引可定位 watering can rim、seedling stem、trowel handle、pot stack rim、sieve mesh 等新增词，返回首页后 1,275 词首页入口仍可用，公开页无 error/warn 日志。
- v55 的温室扩展源码已完成并通过本地门禁，但首次公开归档误用了旧 `dist`，公开页仍返回 46 词；该版本不作为有效交付，保留作失败证据。
- v56 已重新构建并修复场景 JSON cache-bust：温室从 46 增至 71 个词，页面 query `?v=...` 会随请求传给 manifest/scene JSON，避免 CDN 复用旧定义。
- v56 验收证据：`npm run verify`（221 个域测试）、全量 E2E（88 通过 / 34 个设计性跳过）、`PERF_RUN=1 npm run test:perf` 均通过；公开路径从首页进入 Community garden → Greenhouse interior → Tomato plant，温室首屏显示 59/71 词、7 个细分区显示 12/17/6/6/8/12/10 词，scene-word index 可定位 glass door handle、watering can rim、seed tray cell、tomato cluster、gravel stone，返回首页后 1,275 词入口仍可用，公开页无 error/warn 日志。
- v57 已基于 `tomato-plant-premium-v1.jpg` 的最终像素审计扩展 25 个可指认部件，番茄植株从 44 增至 69 个词；复叶、花萼/花药、果实附着、竹竿与绑带、种植袋、土壤和滴灌部件均保留，场景保持终点无入口。
- v57 验收证据：`npm run verify`（221 个域测试）、全量 E2E（88 通过 / 34 个设计性跳过）、`PERF_RUN=1 npm run test:perf` 均通过；公开路径从首页进入 Community garden → Greenhouse interior → Tomato plant，番茄首屏显示 54/69 词、6 个细分区显示 8/15/10/14/18/4 词，场景词索引可定位 leaflet tip、flower sepal、fruit shoulder、bamboo node、grow bag rim、drip barb 等新增词，返回首页后 1,275 词首页入口仍可用，公开页无 error/warn 日志。
- v58 已基于 `city-park-bright-v2.jpg` 的最终像素审计扩展 25 个可指认部件，城市公园从 63 增至 88 个词；池塘/桥、橡树、游乐/野餐、喷泉/凉亭、公园前景五个细节区分别为 22/16/14/16/20 词，两个真实子入口保持不变。
- v58 验收证据：`npm run verify`（221 个域测试）、全量 E2E（88 通过 / 34 个设计性跳过）、`PERF_RUN=1 npm run test:perf` 均通过；公开路径进入 City park 后显示 88 个总词和五个细节区，场景词索引可定位 bridge plank、oak leaf vein、picnic basket weave、path stone、flower stalk、gazebo roof，沿 Oak tree 返回首页后仍为 1,275 个根图集词，公开页无 error/warn 日志。
- v59 已基于 `oak-tree-natural-v3.jpg` 的最终像素审计扩展 25 个可指认部件，橡树从 43 增至 68 个词；左侧树枝、树干微生境、叶片/橡果、树根/真菌/地面、林缘植物五个细节区分别为 12/14/15/16/11 词，Leaf 入口保持不变。
- v59 验收证据：`npm run verify`（221 个域测试）、全量 E2E（88 通过 / 34 个设计性跳过）、`PERF_RUN=1 npm run test:perf` 均通过；公开路径进入 City park → Oak tree 后显示 68 个总词和五个细节区，场景词索引可定位 squirrel tail、oak leaf margin、acorn skin、root ridge、fern pinna、grass blade，进入 Leaf 后返回首页，公开页无 error/warn 日志。
- v60 已基于 `heart-premium-v2.jpg` 的最终像素审计扩展 25 个可指认部件，心脏从 36 增至 61 个词；大血管、心房与房室瓣、心室与心壁、心脏外表面、动脉与血细胞五个细节区分别为 14/11/16/8/12 词，Blood cell 入口保持不变。
- v60 验收证据：`npm run verify`（221 个域测试）、全量 E2E（88 通过 / 34 个设计性跳过）、`PERF_RUN=1 npm run test:perf` 均通过；公开路径进入 City street → Science museum → Human body → Heart 后显示 61 个总词和五个细节区，场景词索引可定位 aortic valve cusp、right atrial wall、trabecular ridge、coronary branch、red cell dimple、capillary branch，进入 Blood cell 后返回首页，公开页无 error/warn 日志。
- v61 已基于 `dinosaur-hall-premium-v1.jpg` 的最终像素审计扩展 25 个可指认部件，恐龙展厅从 44 增至 69 个词；霸王龙头部、中轴骨骼、四肢/足部、三角龙展台、化石柜、准备与地质六个细节区分别为 10/15/13/9/10/11 词，场景保持终点无入口。
- v61 验收证据：`npm run verify`（221 个域测试）、全量 E2E（88 通过 / 34 个设计性跳过）、`PERF_RUN=1 npm run test:perf` 均通过；公开路径进入 City street → Science museum → Dinosaur hall 后显示 69 个总词和六个细节区，场景词索引可定位 skull ridge、jaw hinge、shoulder blade、trilobite segment、brush bristles、hammer head，返回首页，公开页无 error/warn 日志。
- v62 已基于 `pond-edge-premium-v1.jpg` 的最终像素审计扩展 25 个可指认部件，池塘边缘从 40 增至 65 个词；挺水植物/昆虫、漂浮水生花园、开阔倒影水面、清浅水域、岸边纹理、扁石青蛙六个细节区分别为 14/12/8/10/13/7 词，Frog 入口保持不变。
- v62 验收证据：`npm run verify`（221 个域测试）、全量 E2E（88 通过 / 34 个设计性跳过）、`PERF_RUN=1 npm run test:perf` 均通过；公开路径进入 City park → Pond edge 后显示 65 个总词和六个细节区，场景词索引可定位 cattail stem、lily pad vein、water lily center、ripple ring、minnow fin、frog tympanum，进入 Frog 后返回首页，公开页无 error/warn 日志。
- v63 已基于 `frog-premium-v1.jpg` 的最终像素审计扩展 25 个可指认部件，青蛙从 34 增至 59 个词；头部与感官、躯干与皮肤、前肢与前趾、后肢与蹼趾四个细节区分别为 15/14/13/15 词，场景保持终点无入口。
- v63 验收证据：`npm run verify`（221 个域测试）、全量 E2E（88 通过 / 34 个设计性跳过）、`PERF_RUN=1 npm run test:perf` 均通过；公开路径进入 City park → Pond edge → Frog 后显示 59 个总词和四个细节区，场景词索引可定位 eye rim、back spot、forearm、toe segment、stone moss、jawline，返回首页，公开页无 error/warn 日志。
- v64 已基于 `blood-cell-premium-v2.jpg` 的最终像素审计扩展 25 个可指认部件，血细胞从 36 增至 61 个词；毛细血管壁、血液视野、红细胞剖面、中性粒细胞、血小板五个细节区分别为 13/10/21/10/7 词，Hemoglobin 入口保持不变。
- v64 验收证据：`npm run verify`（221 个域测试）、全量 E2E（88 通过 / 34 个设计性跳过）、`PERF_RUN=1 npm run test:perf` 均通过；公开路径进入 City street → Science museum → Human body → Heart → Blood cell 后显示 61 个总词和五个细节区，场景词索引可定位 endothelial border、free red cell、membrane cortex、granule cluster、pseudopod tip、tetramer interface，进入 Hemoglobin 后返回首页，公开页无 error/warn 日志。
- v65 已基于 `rail-bogie-premium-v2.jpg` 的最终像素审计扩展 25 个可指认部件，转向架从 40 增至 65 个词；构架/二系悬挂、动力轮对、轴箱/一系悬挂、走行连杆、轨道接口五个细节区分别为 21/17/7/11/9 词，场景保持终点无入口。
- v65 验收证据：`npm run verify`（221 个域测试）、全量 E2E（88 通过 / 34 个设计性跳过）、`PERF_RUN=1 npm run test:perf` 均通过；公开路径进入 City street → Transit hub → Railway platform → Train carriage → Rail bogie 后显示 65 个总词和五个细节区，场景词索引可定位 frame weld、wheel hub、bearing seal、wheel hub cap、rail foot、sleeper fastener，返回首页，公开页无 error/warn 日志。
- v66 已撤销首页固定词汇列表卡片：默认六个大区仅显示名称；指针进入某个大区时，只有该区的原始锚点词泡挂回插画，移到空白处立即收起；其他大区继续保持名称-only。未修改 `world-map` 的插画、1,275 个锚点坐标或场景数据。
- v66 验收证据：`npm run verify` 与性能 2/2 通过；定向首页/语义桥接 E2E 通过；全量 E2E 为 87 通过 / 34 设计性跳过，另有既有连续转场 tile 中心时序项在 3 次定向复跑中 2 次通过（保留失败证据，未包装为首页故障）。公开 v66 初始首页无词卡/无首页词泡，依次悬停 school/science/transport/farm/market/wetland 时只出现对应大区词（18/21/20/19/27/21 个当前可读泡），移出后回到 0；进入 City street 再返回首页后仍为 `world-map`、0 个首页词泡、0 个词卡，公开页无 error/warn 日志。
- v67 已基于 `battery-premium-v2.jpg` 的最终像素复核扩展 10 个可指认部件，电池包从 32 增至 42 个词；绝缘片、模块夹具、电芯间隔件、电缆夹、电压采样线、冷却液歧管、支撑导轨、通风格栅、外壳加强筋和安装孔分别回挂到四个细节区，原有锂离子电芯入口保持不变。旧审计排除的负极端子、温度/电流传感器和泄压阀仍未加入。
- v67 验收证据：`npm run verify`（222 个域测试）、全量 E2E（90 通过 / 34 个设计性跳过）、`PERF_RUN=1 npm run test:perf`（2/2）均通过；公开路径从首页进入 City street → Transit hub → Electric bus → Battery pack，场景进度显示 42 个词、41 个当前可读词，场景索引可定位 coolant manifold，进入 Lithium-ion cell 后逐级返回首页，最终仍为 `world-map`、0 个首页词泡、0 个词卡，公开页无 error/warn 日志。
- v68 已基于 `electric-bus-premium-v2.jpg` 的最终像素复核扩展 11 个可指认部件，电动公交从 40 增至 51 个词；前/后保险杠、座椅坐垫/支腿、轮圈、悬挂臂、电池托盘、电缆夹、车门把手、踏步和制动盘分别回挂到已有六个细节区，电池包入口保持不变。乘客、线路、目的地和运行状态等不可见概念仍未加入。
- v68 验收证据：`npm run verify`（223 个域测试）、全量 E2E（90 通过 / 34 个设计性跳过）、`PERF_RUN=1 npm run test:perf`（2/2）均通过；公开路径从首页进入 City street → Transit hub → Electric bus，场景进度显示 51 个词、公开索引可定位 front bumper，继续进入 Battery pack 后显示 42 个词并返回首页，公开页无 error/warn 日志。
- v69 已将空间滚轮灵敏度从 `0.0017` 调整为 `0.00145`，并同步入口回退契约：公寓适配视图连续回退实测为 `0.841 → 0.707 → world-map`，首步和第二步都不会误跳首页；标签/入口/语义大图回归保持通过。
- v69 验收证据：`npm run verify`（223 个域测试）、全量 E2E（90 通过 / 34 个设计性跳过）、`PERF_RUN=1 npm run test:perf`（2/2）均通过；公开 v69 首页无首页词泡/词卡，进入 Apartment 后回退比例如上，返回首页仍为 `world-map`、1,275 个根词、无 error/warn 日志。后续仍需观察高密度场景中避让方向在边缘处的跳位幅度。
- v70 已把实际小地图高度的保护区从 126px 收紧到 120px，减少标题底部附近词泡的无谓退让；公开 v70 冒烟仍保持首页、入口与回退契约不变。
- v70 验收证据：`npm run verify`（223 个域测试）、全量 E2E（90 通过 / 34 个设计性跳过）、`PERF_RUN=1 npm run test:perf`（2/2）均通过；公开页面小地图附近词泡保持可读，未出现新增 error/warn。
- v71 已在 `computeSceneLabelLayout` 的记忆槽位失效时加入有限的中间候选点，优先沿最近的可用方向移动，不放宽碰撞保护；公开 Apartment 连续放大实测 `living room` 全程保持可见，避让跳位幅度降低，首页与入口状态无回归。
- v71 验收证据：`npm run verify`（223 个域测试）、全量 E2E（90 通过 / 34 个设计性跳过）、`PERF_RUN=1 npm run test:perf`（2/2）均通过；公开 v71 首页/Apartment 冒烟无 error/warn。极端边缘与多标签同时碰撞仍可能需要较大方向切换，继续观察。
- v72 已基于 `human-body-premium-v2.jpg` 的最终像素复核扩展 20 个可指认部件，人体展柜从 40 增至 60 个词；新增胸腹分区、下颌/椎骨/桡尺骨/腓骨/骶骨、腕足骨组和胸肌/肱三头肌/腹肌/小腿肌，五个缩放层均为 12 个词，Heart 入口保持不变。公开路径从 City street → Science museum → Human body 验证搜索总数 60、首屏词与新增骨骼/肌肉词可见，返回首页后仍为 1,275 个根词、首页默认 0 个词泡；无新增 error/warn。`npm run verify`、全量 E2E（89 通过 / 34 个设计性跳过；连续瓦片项单独复跑通过）和 `PERF_RUN=1 npm run test:perf`（2/2）均通过。
- v73 已基于 `coffee-machine-premium-v1.jpg` 的最终像素复核扩展 20 个可指认部件，咖啡机从 40 增至 60 个词；新增顶板、豆道、研磨腔、冲煮网/密封圈、手柄、排水孔、锅炉接头/阀、软管夹、泵进出口、流量计和端子排等，水箱入口保持不变。公开路径从 Apartment → Kitchen → Coffee machine 验证搜索总数 60，并在锅炉与水路细节区定位新增泵/阀/管路词；首页悬浮模式仍正常。`npm run verify`、全量 E2E（89 通过 / 34 个设计性跳过；连续瓦片项单独复跑通过）和 `PERF_RUN=1 npm run test:perf`（2/2）均通过。
- v74 修正 `pump housing` 与 `water pump` 共用同一像素导致的覆盖，将泵壳锚点移到照片中独立的黑色泵体（1190,580），并加入契约断言。公开锅炉与水路细节区已能同时显示泵壳、泵进出口和流量计；公开页无 error/warn。完整回归保持通过，连续瓦片项在并行全量中偶发几何时序抖动，5 次定向复跑全部通过。
- v75 已基于 `lithium-ion-cell-premium-v2.jpg` 的最终像素复核扩展 15 个可指认结构，锂离子电芯从 31 增至 46 个词；新增端子垫圈、注液孔盖、防爆阀边框、顶盖接缝、隔膜/电极边缘、壳体圆角、卷绕端面/边缘、极耳焊点、箔片折痕、底部绝缘层、底部导轨和展开层尖端，保持终点场景无入口。公开路径从 City street → Transit hub → Electric bus → Battery pack → Lithium-ion cell 验证 46 个总词、四个细节区和新增词可达；首页悬浮模式和公开页日志无回归。`npm run verify`、全量 E2E（90 通过 / 34 个设计性跳过）和 `PERF_RUN=1 npm run test:perf`（2/2）均通过。
- v76 针对连续放大时碰撞换槽位导致的 70–200px 视觉跳动，增加 16 方向×4 半径的确定性候选槽，并只对偏移变化 ≥12px 的标签启用 140ms 的 transform/引线过渡；不放宽碰撞或锚点规则。公开公寓冒烟确认过渡标记可触发，首页悬浮仍为对应分区 18 个词、移出回到 0，公开页无 error/warn。`npm run verify`、全量 E2E（90 通过 / 34 个设计性跳过）和性能 2/2 均通过；本地连续缩放测量的最大偏移跳变由约 149px 降至约 95px。下一步继续观察高密度边缘场景，若出现真实残留再调整。
- v77 在不改变锚点和碰撞规则的前提下，将桌面空间词泡从 20/18px 收紧到 15/13px、默认填充透明度从 72% 降到 64%，并使用 0.45px 纯白描边与轻量暗阴影；移动端仍保留 28px 触控尺寸。公开公寓冒烟实测首屏词泡高度 15px，首页悬浮 school 区显示 21 个词、移出回到 0，连续缩放可触发有限过渡，公开页无 error/warn。`npm run verify`、全量 E2E（90 通过 / 34 个设计性跳过）和性能 2/2 均通过。下一步继续观察高密度边缘场景，若出现真实残留再调整。
- v78 已基于 `water-tank-premium-v1.jpg` 的最终像素复核扩展 14 个可指认部件，水箱从 36 增至 50 个词；新增注水口、盖子内侧、铰链筒/臂、卡扣嵌件、出水管、阀芯/阀座、过滤器壳/边框/网孔、出水口支架/套环和底座边缘，Polymer 入口保持不变。公开路径从 Apartment → Kitchen → Coffee machine → Water tank 验证搜索总数 50、出水阀细节区的新增词和 Polymer 入口，首页悬浮模式仍正常；公开页无 error/warn。`npm run verify`、全量 E2E（90 通过 / 34 个设计性跳过）和 `PERF_RUN=1 npm run test:perf`（2/2）均通过。
- v79 已基于 `cotton-shirt-premium-v2.jpg` 的最终像素复核扩展 15 个可指认结构，棉衬衫从 40 增至 55 个词；新增过肩、领尖纽扣、侧缝、纽扣孔、袖口开口、口袋角、袖口纽扣孔、针眼/针尖、线圈、线轴芯、顶针边缘、针头和剪刀转轴/握柄，保持终点场景无入口。公开路径从 Apartment → Bedroom → Wardrobe interior → Cotton shirt 验证搜索总数 55、衣领/袖口/工具词可达；公开页无 error/warn。`npm run verify`、全量 E2E（90 通过 / 34 个设计性跳过）和 `PERF_RUN=1 npm run test:perf`（2/2）均通过。
- v80 将棉衬衫原本横跨整张底部的区域拆成 `Cotton materials`（全景原料区，4 个词）与 `Sewing tools`（右下工具区，16 个词），小地图点击后可分别聚焦；其余四个区域、55 个锚点和终点语义不变。公开冒烟确认工具区可见针、线轴、顶针、针垫和剪刀等新增词，首页悬浮仍为 21/0，公开页无 error/warn。`npm run verify`、全量 E2E（90 通过 / 34 个设计性跳过）和 `PERF_RUN=1 npm run test:perf`（2/2）均通过。
- v81 将 Apartment 原本横跨全高的 `central-stair-detail` 拆成 `Stair entrance`（8 词）与 `Stair steps`（4 词），两区目标缩放均为 2.35，保持 107 个场景锚点、四个房间入口和回退边界不变。公开冒烟确认上下楼梯区分别能聚焦对应词批次，首页悬浮仍为 21/0，公开页无 error/warn；`npm run verify`、全量 E2E（90 通过 / 34 个设计性跳过；连续瓦片项 5 次定向复跑通过）和 `PERF_RUN=1 npm run test:perf`（2/2）均通过。
- 下一步继续：先复核下一张最终像素成品再制作真实物体词汇；不要回滚首页 1,275 个锚点或用同义词填数。

## 未完成任务（按优先级）

1. **高密度场景批次**：当前已把医院 320、病理实验室 330、医院药房 270、机场 270、写字楼 270、城市街景 149、交通枢纽 103、科学馆 176、城市公园 144、社区花园 103 做成高密度词场；其余终点场景仍按 `docs/next-scene-batch.md` 逐场景扩展。继续先复核最终像素，再从真实物体重新标注；不要用同义词、推断属性或重复部件填数。
   - 下一批候选：从 `docs/next-scene-batch.md` 选择仍有足够真实像素证据的稀疏场景；先复核最终像素再决定是否扩展。
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
- v42 真实公开冒烟：首页仍显示 1,275 个词与 105 个首屏锚点；沿城市公园 → 橡树 → 叶片 → 植物细胞进入后为 46 个总词、5 个区域，首屏 41 个词，叶绿体入口和新增细胞结构均可达，页面无浏览器日志。
- v42 回归证据：`npm run verify` 通过（215 个域测试），完整 E2E 88 通过 / 34 个设计性跳过，性能 2/2 通过；语义 1,013 词叶与本景词索引仍重复验证通过。
- v43 回归证据：`npm run verify` 通过（215 个域测试），完整 E2E 88 通过 / 34 个设计性跳过，性能 2/2 通过；公开冒烟覆盖根大类词表、分类词卡、显式 City street 入口和返回首页。
- v44 回归证据：`npm run verify` 通过（215 个域测试），单 worker 全量 E2E 88 通过 / 34 个设计性跳过，性能 2/2 通过；公开冒烟覆盖叶绿体路径、Grana 细节区、腔与蛋白细节区和返回首页。
- v45 回归证据：`npm run verify` 通过（215 个域测试），全量 E2E 88 通过 / 34 个设计性跳过，性能 2/2 通过；公开冒烟覆盖城市公园首屏、池塘/桥细节区、前景细节区和返回首页。
- v46 回归证据：`npm run verify` 通过（215 个域测试），全量 E2E 88 通过 / 34 个设计性跳过，性能 2/2 通过；公开冒烟覆盖科学馆五个细节区、六个新增代表词和返回首页。
- v47 回归证据：`npm run verify` 通过（216 个域测试），全量 E2E 88 通过 / 34 个设计性跳过，性能 2/2 通过；公开冒烟覆盖厨房四个细节区、七个新增代表词和返回首页。
- v48 回归证据：`npm run verify` 通过（216 个域测试），全量 E2E 88 通过 / 34 个设计性跳过，性能 2/2 通过；公开冒烟覆盖浴室六个细节区、六个新增代表词和返回首页。
- v49 回归证据：`npm run verify` 通过（217 个域测试），全量 E2E 88 通过 / 34 个设计性跳过，性能 2/2 通过；公开冒烟覆盖卧室五个细分区、五个新增代表词和返回首页。
- v50 回归证据：`npm run verify` 通过（218 个域测试），全量 E2E 88 通过 / 34 个设计性跳过，性能 2/2 通过；公开冒烟覆盖铁路站台四个细分区、四个新增代表词和返回首页。
- v51 回归证据：`npm run verify` 通过（219 个域测试），全量 E2E 88 通过 / 34 个设计性跳过，性能 2/2 通过；公开冒烟覆盖交通枢纽四个细分区、四个新增代表词和返回首页。
- v52 回归证据：`npm run verify` 通过（220 个域测试），全量 E2E 88 通过 / 34 个设计性跳过，性能 2/2 通过；公开冒烟覆盖城市咖啡馆五个细分区、五个新增代表词和返回首页。
- v53 回归证据：`npm run verify` 通过（220 个域测试），全量 E2E 88 通过 / 34 个设计性跳过，性能 2/2 通过；公开冒烟覆盖社区花园七个细分区、五个新增代表词和返回首页。
- v54 回归证据：`npm run verify` 通过（220 个域测试），全量 E2E 88 通过 / 34 个设计性跳过，性能 2/2 通过；公开冒烟覆盖园艺工作台七个细分区、五个新增代表词和返回首页。
- v56 回归证据：`npm run verify` 通过（221 个域测试），全量 E2E 88 通过 / 34 个设计性跳过，性能 2/2 通过；公开冒烟覆盖温室内部七个细分区、五个新增代表词、Tomato plant 入口和返回首页。
- v57 回归证据：`npm run verify` 通过（221 个域测试），全量 E2E 88 通过 / 34 个设计性跳过，性能 2/2 通过；公开冒烟覆盖番茄植株六个细分区、六个新增代表词和返回首页。

## 会话与临时文件边界

- 2026-08-28 可恢复清理：`/Users/fanli/.codex/sessions` 仍有 413 个 JSONL、约 14 GiB；HelloWords 仅剩当前打开的根会话（约 1.136 GB，写锁仍在），因此没有移动它，其他项目的未归档会话也未动。已将 `archived_sessions` 中 2026-08-01 前的 108 个已归档文件（约 300 MB）移至 `/Users/fanli/.Trash/codex-session-cleanup-20260828/archived-sessions-before-20260801/`；需要恢复时可整体移回。
- 2026-08-28 Codex 临时目录：4 个带活动锁的 app-server 目录保留；5 个未锁定、仅含 Codex 工具链接的旧 `arg0` 目录移至 `/Users/fanli/.Trash/codex-session-cleanup-20260828/codex-tmp-unlocked/`。
- 2026-08-28 HelloWords 临时产物：`/private/tmp` 下 5 个 `hellowords-*` 验收 JSON/headers，以及 `/var/folders/.../T/hellowords-wordnet-*.zip` 移至回收站同名子目录；没有打开句柄。`/private/tmp/llf` 仍被 Typora/gost/zsh 使用，未动；Codex/浏览器 runtime 目录未动。
- 共享外置根 `/Volumes/micron512g/tmp-project/codex-audit-tmp` 含其他项目（主要是 MDD/runner）的测试与恢复资料，未做整根删除；仅移走其中一个空的重复目录，HelloWords 专用的 4 个 `inspect-*` 图像裁剪仍作为可复核证据保留。`/Volumes/micron512g/tmp-project` 中的 MDD 活动目录同样保留。

- 已清理 126 个无活动写锁的 HelloWords 子 agent/guardian JSONL（约 18.353 GiB），并保留当前根会话。
- 已清理 311 个明确属于 HelloWords/atlas 的 `/private/tmp` 路径（约 1.08 GiB）；约 196 MiB 的词汇源缓存已移入本地 handoff 的 `source-cache/`，可复现但不进入 Git。
- 旧的“评估当前项目”线程已归档，仍可恢复；其他项目的 sessions 未触碰。
- 精确首行 `cwd` 扫描显示 HelloWords 只剩当前根 JSONL。其他日志即使正文提到 HelloWords，只要归属 Gust、EasyTier 或其他项目，就必须保留。
- `/private/tmp` 当前约 11MB，未发现 HelloWords/atlas 命名残留；以后清理只针对有证据的项目路径，不能清空整个 tmp。
- 外置审计临时根中 17 份旧 HelloWords 发布压缩包及 v21 构建日志已移入系统废纸篓；源码、Sites 保存版本、审计 JSON 与词库源缓存仍保留。
- 本轮复核未发现新的 HelloWords/atlas 临时路径：`/private/tmp`、`/Volumes/micron512g/tmp-project` 和项目外置审计根中的同名路径均为空；v48–v54 归档已由 Sites 保存，v55 旧归档和 v56 修正版归档均保留在系统废纸篓作可恢复证据，v57 归档在验证后移入系统废纸篓；共享临时根内其它项目任务继续保留。
- 叶绿体像素复核产生的 `inspect-cell/` 临时裁剪目录及重复词库缓存已移入系统废纸篓；`/var/folders` 下的 Codex runtime 目录继续保留。
- 发现的孤立词库缓存 `/var/folders/.../T/hellowords-wordnet-cbda5ea6eef7.zip` 未被任何进程打开，已移入系统废纸篓；浏览器/Codex runtime 目录未触碰。
- 已停止一个无测试进程使用的本地 HelloWords `vinext` 4173 服务；公开站点和当前源代码不受影响。

## 续开发起点

```sh
cd /Volumes/micron512g/code/hellowords
git status --short --branch
git diff --check
npx tsx --test tests/domain/worldAtlasVisualContract.test.ts
```

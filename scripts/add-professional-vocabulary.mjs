import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

/**
 * Adds the next reviewed vocabulary bands to the professional scenes.  The
 * source regions are deliberately broad, visible crop contracts already used
 * by the scenes; this script only adds nouns that belong to those crops and
 * places them on a deterministic grid inside the same region.  Keeping the
 * authoring data here makes a large content pass reviewable and repeatable
 * without hand-editing hundreds of nearly identical JSON objects.
 */

const projectRoot = resolve(import.meta.dirname, "..");
const dataRoot = resolve(projectRoot, "public/data/scenes");

function parseTerms(raw) {
  return raw.trim().split("\n").map((line) => {
    const [word, translation] = line.split("=");
    if (!word?.trim() || !translation?.trim()) {
      throw new Error(`Invalid term row: ${line}`);
    }
    return { word: word.trim(), translation: translation.trim() };
  });
}

function group(sceneId, regionId, zoneId, raw) {
  const terms = parseTerms(raw);
  if (terms.length !== 30) {
    throw new Error(`${sceneId}/${regionId} needs exactly 30 terms, got ${terms.length}`);
  }
  return { sceneId, regionId, zoneId, terms };
}

const groups = [
  group("hospital", "emergency-department", "emergency-department-detail", `
    intensive care unit=重症监护室
    outpatient clinic=门诊部
    inpatient ward=住院病房
    cardiology=心脏科
    neurology=神经科
    oncology=肿瘤科
    pediatrics=儿科
    dermatology=皮肤科
    orthopedics=骨科
    ophthalmology=眼科
    urology=泌尿科
    nephrology=肾脏科
    gastroenterology=消化科
    endocrinology=内分泌科
    pulmonology=呼吸科
    rheumatology=风湿科
    psychiatry=精神科
    obstetrics=产科
    gynecology=妇科
    anesthesiology=麻醉科
    dialysis unit=透析室
    isolation room=隔离室
    nurse station=护士站
    wheelchair=轮椅
    stretcher=担架
    infusion stand=输液架
    syringe=注射器
    exam glove=检查手套
    face mask=医用口罩
    stethoscope=听诊器
  `),
  group("hospital", "pathology-laboratory", "pathology-laboratory-detail", `
    laboratory analyzer=实验室分析仪
    chemistry analyzer=生化分析仪
    hematology analyzer=血液分析仪
    blood analyzer=血液检测仪
    specimen bag=标本袋
    sample tube=样本管
    swab specimen=拭子标本
    urine sample=尿液样本
    tissue block=组织块
    paraffin block=石蜡块
    biopsy core=活检柱
    specimen barcode=标本条码
    slide tray=载玻片托盘
    microscope arm=显微镜支臂
    microscope turret=显微镜转换器
    ocular lens=目镜镜片
    objective turret=物镜转换器
    condenser lens=聚光镜片
    stage insert=载物台嵌件
    stage rail=载物台导轨
    specimen clamp=标本夹
    focusing collar=调焦环
    aperture lever=光阑拨杆
    lamp switch=照明开关
    illumination ring=照明环
    nosepiece collar=物镜座环
    microscope base=显微镜底座
    lens tissue=镜头纸
    immersion oil=浸油
    slide marker=载玻片标记笔
  `),
  group("hospital", "radiology-suite", "radiology-suite-detail", `
    ultrasound room=超声室
    ultrasound probe=超声探头
    echocardiography=超声心动图
    endoscopy suite=内镜室
    imaging bed=影像检查床
    radiographer console=放射技师控制台
    mammography unit=乳腺摄影机
    fluoroscopy unit=透视机
    x ray tube= X射线管
    detector panel=探测器面板
    contrast injector=造影剂注射器
    lead apron=铅围裙
    MRI coil=磁共振线圈
    gradient coil=梯度线圈
    RF coil=射频线圈
    CT detector=CT探测器
    scan gantry=扫描机架
    table control=检查床控制器
    scout image=定位图像
    slice image=断层图像
    image panel=图像面板
    film badge=胶片剂量计
    ceiling rail=天花导轨
    cable conduit=线缆导管
    patient strap=患者固定带
    headrest=头枕
    bore light=孔腔照明
    detector cover=探测器护盖
    console keyboard=控制台键盘
    warning lamp=警示灯
  `),
  group("hospital", "pharmacy-dispensary", "pharmacy-dispensary-detail", `
    cetirizine=西替利嗪
    loratadine=氯雷他定
    montelukast=孟鲁司特
    budesonide=布地奈德
    fluticasone=氟替卡松
    desloratadine=地氯雷他定
    lisinopril=赖诺普利
    valsartan=缬沙坦
    bisoprolol=比索洛尔
    carvedilol=卡维地洛
    spironolactone=螺内酯
    hydrochlorothiazide=氢氯噻嗪
    glimepiride=格列美脲
    sitagliptin=西格列汀
    empagliflozin=恩格列净
    gliclazide=格列齐特
    pioglitazone=吡格列酮
    rosuvastatin=瑞舒伐他汀
    rivaroxaban=利伐沙班
    apixaban=阿哌沙班
    cefazolin=头孢唑林
    fluconazole=氟康唑
    acyclovir=阿昔洛韦
    meropenem=美罗培南
    nitrofurantoin=呋喃妥因
    levetiracetam=左乙拉西坦
    gabapentin=加巴喷丁
    tacrolimus=他克莫司
    lamotrigine=拉莫三嗪
    allopurinol=别嘌醇
  `),
  group("hospital", "clinical-reference", "clinical-reference-detail", `
    hypertension=高血压
    heart failure=心力衰竭
    coronary artery disease=冠状动脉疾病
    arrhythmia=心律失常
    migraine=偏头痛
    epilepsy=癫痫
    meningitis=脑膜炎
    breast cancer=乳腺癌
    lung cancer=肺癌
    colorectal cancer=结直肠癌
    leukemia=白血病
    lymphoma=淋巴瘤
    dermatitis=皮炎
    eczema=湿疹
    psoriasis=银屑病
    osteoarthritis=骨关节炎
    osteoporosis=骨质疏松
    appendicitis=阑尾炎
    gastritis=胃炎
    hepatitis=肝炎
    cirrhosis=肝硬化
    kidney stone=肾结石
    nephritis=肾炎
    bronchitis=支气管炎
    influenza=流感
    measles=麻疹
    dengue=登革热
    sepsis=脓毒症
    glaucoma=青光眼
    cataract=白内障
  `),

  group("pathology-lab", "microscope-bench", "microscope-bench-detail", `
    field of view=视野
    brightfield microscope=明场显微镜
    darkfield microscope=暗场显微镜
    microscope stand=显微镜支架
    slide digitizer=切片数字化仪
    digital microscope=数字显微镜
    ocular tube=目镜筒
    binocular head=双目镜头
    eyepiece tube=目镜管
    objective turret=物镜转换器
    condenser iris=聚光器光阑
    immersion objective=油浸物镜
    dry objective=干式物镜
    stage insert=载物台嵌件
    stage rail=载物台导轨
    specimen clamp=标本夹
    focusing collar=调焦环
    aperture lever=光阑拨杆
    lamp switch=照明开关
    illumination ring=照明环
    nosepiece collar=物镜座环
    microscope base=显微镜底座
    lens tissue=镜头纸
    immersion oil=浸油
    slide marker=载玻片标记笔
    microscope cover=显微镜护罩
    bench drawer=工作台抽屉
    power lead=电源线
    specimen trolley=标本推车
    lens cap=镜头盖
  `),
  group("pathology-lab", "specimen-processing", "specimen-processing-detail", `
    grossing station=取材台
    specimen bucket=标本桶
    specimen pouch=标本袋
    tissue ruler=组织尺
    metric scale=刻度尺
    dissecting tray=解剖托盘
    tissue forceps=组织镊
    dissecting scissors=解剖剪
    specimen spoon=标本匙
    biopsy punch=活检冲头
    cassette printer=包埋盒打印机
    label roll=标签卷
    fixation jar=固定液罐
    buffered formalin=缓冲福尔马林
    tissue sponge=组织海绵
    specimen rack=标本架
    tube carrier=试管托
    sample funnel=样本漏斗
    waste container=废物容器
    safety shield=防护挡板
    splash guard=防溅挡板
    specimen tag=标本标签
    tray liner=托盘衬垫
    cutting board=切割板
    ruler edge=尺边
    forceps jaw=镊齿
    scalpel blade=手术刀片
    grossing mat=取材垫
    station drain=工作台排水口
    container lid=容器盖
  `),
  group("pathology-lab", "embedding-station", "embedding-station-detail", `
    embedding center=包埋中心
    paraffin dispenser=石蜡分配器
    cold plate=冷台
    heated forceps=加热镊
    mold base=模具底座
    mold insert=模具嵌件
    wax nozzle=蜡液喷嘴
    embedding ring=包埋环
    cassette clamp=包埋盒夹
    cooling block=冷却块
    hot plate=热台
    forceps heater=镊子加热器
    trimming blade=修块刀片
    blade clamp=刀片夹
    feed lever=进给杆
    section thickness knob=切片厚度旋钮
    ribbon brush=切片带刷
    anti roll plate=防卷板
    waste drawer=废料抽屉
    shavings tray=蜡屑托盘
    paraffin flake=石蜡薄片
    wax pellet=蜡粒
    block label=蜡块标签
    mold divider=模具隔板
    block corner=蜡块角
    block ejector=蜡块推出器
    heater switch=加热开关
    plate handle=托板把手
    wax drip=蜡滴
    mold latch=模具卡扣
  `),
  group("pathology-lab", "slide-staining", "slide-staining-detail", `
    hematoxylin=苏木精
    eosin=伊红
    immunostain=免疫染色
    special stain=特殊染色
    staining jar=染色缸
    rinse bath=冲洗槽
    reagent tray=试剂托盘
    wash bottle=洗瓶
    drying rack=晾片架
    slide forceps=载玻片镊
    slide label=载玻片标签
    slide scanner=载玻片扫描仪
    stain timer=染色计时器
    rack handle=架把手
    jar lid=罐盖
    bath heater=槽加热器
    rinse nozzle=冲洗喷嘴
    drain pan=排液盘
    tissue section=组织切片
    stained section=染色切片
    color band=色带
    mounting medium=封片剂
    resin drop=树脂滴
    cover glass=盖玻片
    drying cabinet=干燥柜
    stain residue=染液残留
    drip tray=滴液盘
    rack post=架立柱
    bottle cap=瓶盖
    slide rail=载玻片导轨
  `),
  group("pathology-lab", "clinical-display", "clinical-display-detail", `
    surgical pathology=外科病理
    molecular pathology=分子病理
    forensic pathology=法医病理
    cytopathology report=细胞病理报告
    immunohistochemistry=免疫组织化学
    frozen section=冰冻切片
    benign lesion=良性病变
    malignant lesion=恶性病变
    dysplasia=异型增生
    metastasis=转移
    carcinoma=癌
    sarcoma=肉瘤
    adenoma=腺瘤
    lymphoma=淋巴瘤
    leukemia=白血病
    melanoma=黑色素瘤
    lipoma=脂肪瘤
    polyp=息肉
    cell atypia=细胞异型
    tissue architecture=组织结构
    glandular tissue=腺体组织
    squamous tissue=鳞状组织
    connective stroma=结缔基质
    mucosal tissue=黏膜组织
    pathology image=病理图像
    diagnostic panel=诊断面板
    case number=病例编号
    report page=报告页
    specimen note=标本备注
    slide index=切片索引
  `),

  group("hospital-pharmacy", "medicine-shelves", "medicine-shelves-detail", `
    cetirizine=西替利嗪
    loratadine=氯雷他定
    montelukast=孟鲁司特
    budesonide=布地奈德
    fluticasone=氟替卡松
    desloratadine=地氯雷他定
    lisinopril=赖诺普利
    valsartan=缬沙坦
    bisoprolol=比索洛尔
    carvedilol=卡维地洛
    spironolactone=螺内酯
    hydrochlorothiazide=氢氯噻嗪
    glimepiride=格列美脲
    sitagliptin=西格列汀
    empagliflozin=恩格列净
    gliclazide=格列齐特
    pioglitazone=吡格列酮
    rosuvastatin=瑞舒伐他汀
    rivaroxaban=利伐沙班
    apixaban=阿哌沙班
    cefazolin=头孢唑林
    fluconazole=氟康唑
    acyclovir=阿昔洛韦
    meropenem=美罗培南
    nitrofurantoin=呋喃妥因
    levetiracetam=左乙拉西坦
    gabapentin=加巴喷丁
    amlodipine=氨氯地平
    tacrolimus=他克莫司
    lamotrigine=拉莫三嗪
  `),
  group("hospital-pharmacy", "dispensing-counter", "dispensing-counter-detail", `
    dispensing tray=调配托盘
    capsule counter=胶囊计数器
    pill counter=药片计数器
    tablet cutter=药片切割器
    mortar bowl=研钵
    pestle handle=研杵柄
    powder paper=药粉纸
    oral syringe=口服注射器
    measuring spoon=量匙
    dosing cup=量药杯
    barcode scanner=条码扫描器
    receipt printer=收据打印机
    prescription folder=处方夹
    order basket=订单篮
    pickup shelf=取药架
    service bell=服务铃
    queue ticket=排队号票
    bag seal=药袋封条
    paper bag=纸袋
    adhesive label=不干胶标签
    thermal roll=热敏纸卷
    tablet chute=药片滑槽
    capsule scoop=胶囊勺
    dispensing cap=调配瓶盖
    ampoule tray=安瓿托盘
    bottle opener=瓶盖开启器
    drawer organizer=抽屉分隔盒
    counter scale=柜台秤
    powder funnel=药粉漏斗
    pickup window=取药窗口
  `),
  group("hospital-pharmacy", "automated-cabinet", "automated-cabinet-detail", `
    automated drawer=自动抽屉
    drug bin=药品料盒
    cold compartment=冷藏格
    cabinet scanner=柜体扫描器
    access badge=访问卡
    drawer rail=抽屉导轨
    shelf divider=货架隔板
    cabinet motor=柜体电机
    drawer latch=抽屉卡扣
    locking bar=锁杆
    barcode window=条码窗口
    status screen=状态屏
    alarm light=报警灯
    vial cradle=药瓶托架
    carton slot=纸盒槽
    blister drawer=泡罩抽屉
    drawer label=抽屉标签
    cabinet plinth=柜体底座
    door gasket=柜门密封垫
    hinge cover=铰链护盖
    keypad cover=键盘护盖
    lock cylinder=锁芯
    cabinet handle=柜门把手
    shelf stop=货架挡块
    bay light=格口照明
    bin partition=料盒分隔板
    stock card=库存卡
    cabinet foot=柜脚
    drawer faceplate=抽屉面板
    access reader=门禁读卡器
  `),
  group("hospital-pharmacy", "compounding-bench", "compounding-bench-detail", `
    compounding hood=配制罩
    powder balance=粉末天平
    weighing boat=称量舟
    glass beaker=玻璃烧杯
    stirring paddle=搅拌桨
    transfer funnel=转移漏斗
    spatula blade=药匙刃
    powder scoop=药粉勺
    graduated pipette=刻度移液管
    mixing vial=混合小瓶
    amber bottle=棕色瓶
    ointment jar=软膏罐
    filter paper=滤纸
    sieve mesh=筛网
    mixing beaker=混合烧杯
    wash bottle=洗瓶
    alcohol lamp=酒精灯
    bench scale=工作台秤
    spill tray=溢出托盘
    absorbent pad=吸液垫
    waste scoop=废料勺
    faucet handle=水龙头把手
    drain stopper=排水塞
    splashback=防溅板
    beaker rim=烧杯边
    funnel neck=漏斗颈
    scoop handle=勺柄
    scale display=秤显示屏
    bench clamp=工作台夹
    tray corner=托盘角
  `),

  group("airport", "check-in-hall", "check-in-detail", `
    passport gate=护照闸机
    bag drop=行李托运台
    bag drop counter=行李托运柜台
    boarding pass printer=登机牌打印机
    passport reader=护照读取器
    luggage tag printer=行李牌打印机
    travel document=旅行证件
    security seal=安全封条
    baggage receipt=行李收据
    queue stanchion=排队立柱
    queue rope=排队绳
    lane sign=通道标牌
    counter monitor=柜台显示器
    document tray=证件托盘
    scale display=秤显示屏
    luggage bin=行李箱
    oversize baggage=超规行李
    baggage chute=行李滑道
    counter partition=柜台隔板
    ticket scanner=票据扫描器
    passport tray=护照托盘
    kiosk pedestal=自助机底座
    touchscreen bezel=触摸屏边框
    paper slot=纸张插槽
    bag belt=行李带
    belt guide=传送带导轨
    trolley handle=行李车把手
    wheel brake=车轮制动器
    document pocket=证件袋
    bag strap=行李带
  `),
  group("airport", "security-screening", "security-detail", `
    security tray=安检托盘
    body scanner=人体扫描仪
    walk through scanner=通道式扫描仪
    hand scanner=手持扫描仪
    security monitor=安检显示器
    x ray console= X射线控制台
    image screen=成像屏幕
    tray return=托盘回收台
    roller conveyor=滚筒传送带
    inspection bench=检查工作台
    liquid bag=液体袋
    electronics tray=电子设备托盘
    shoe tray=鞋物托盘
    coat bin=外套箱
    security belt=安检传送带
    belt guard=传送带护板
    warning beacon=警示信标
    lane post=通道立柱
    glass divider=玻璃隔板
    access door=通行门
    scanner panel=扫描面板
    tunnel light=通道灯
    detector mat=探测垫
    scanner floor marker=扫描区地面标记
    power cabinet=电源柜
    cable cover=线缆护盖
    tray stacker=托盘堆叠架
    tray shelf=托盘架
    bin handle=箱体把手
    inspection lamp=检查灯
  `),
  group("airport", "departure-concourse", "departure-concourse-detail", `
    boarding queue=登机队列
    airport lounge=机场休息区
    travelator=自动人行道
    moving walkway=移动步道
    escalator=自动扶梯
    lift lobby=电梯厅
    seat row=座椅排
    side table=边桌
    charging locker=充电柜
    water fountain=饮水台
    window sill=窗台
    concourse light=大厅灯
    wayfinding panel=导向面板
    gate barrier=登机口隔栏
    queue belt=排队带
    qr reader=二维码读取器
    gate monitor=登机口显示器
    boarding desk=登机服务台
    service counter=服务柜台
    lounge table=休息区桌
    seat divider=座椅隔板
    seat number=座位号
    terminal clock=航站楼时钟
    bridge corridor=廊桥通道
    jet bridge floor=登机桥地面
    bridge door=廊桥门
    aircraft stairs=登机梯
    baggage door=行李舱门
    departure board=出发信息板
    concourse column=大厅立柱
  `),
  group("airport", "airside-apron", "airside-detail", `
    apron stand=机坪机位
    aircraft fuselage=飞机机身
    cockpit door=驾驶舱门
    windscreen=挡风玻璃
    landing light=着陆灯
    wing root=机翼根部
    flap track=襟翼滑轨
    spoiler=扰流板
    aileron=副翼
    rudder=方向舵
    elevator=升降舵
    vertical stabilizer=垂直安定面
    horizontal stabilizer=水平安定面
    nose gear=前起落架
    main gear=主起落架
    gear strut=起落架支柱
    wheel hub=轮毂
    brake disc=刹车盘
    cargo hold=货舱
    cargo door=货舱门
    service vehicle=服务车辆
    baggage loader=行李装卸车
    fuel truck=加油车
    tow tractor=牵引车
    pushback tug=推出牵引车
    ground cone=地面锥桶
    safety chock=安全轮挡
    marshaller wand=指挥棒
    apron marking=机坪标线
    jet blast fence=喷流防护栏
  `),

  group("office-building", "reception-lobby", "reception-lobby-detail", `
    visitor kiosk=访客自助机
    access gate=门禁闸机
    directory panel=目录面板
    visitor log=访客登记簿
    badge scanner=证件扫描器
    entry barrier=入口隔栏
    mail shelf=邮件架
    parcel locker=包裹柜
    waiting sofa=等候沙发
    lounge table=休息桌
    floor lamp=落地灯
    wall clock=挂钟
    atrium railing=中庭栏杆
    planter box=种植箱
    reception stool=前台高脚凳
    security camera=安防摄像机
    intercom panel=对讲面板
    door closer=闭门器
    door threshold=门槛
    elevator lobby=电梯厅
    lift call panel=电梯呼叫面板
    marble floor=大理石地面
    ceiling pendant=吊灯
    wall niche=墙龛
    coat hook=衣帽钩
    brochure stand=宣传册架
    visitor pass=访客通行证
    parcel shelf=包裹架
    lobby column=大堂立柱
    entrance mat=入口垫
  `),
  group("office-building", "open-plan-office", "open-plan-detail", `
    hot desk=共享办公桌
    sit stand desk=升降桌
    monitor arm=显示器支臂
    docking station=扩展坞
    webcam=网络摄像头
    headset=耳机
    desk phone=办公电话
    document tray=文件托盘
    pinboard=软木板
    filing tray=文件托
    storage pedestal=活动柜
    cable grommet=走线孔
    power socket=电源插座
    desk mat=桌垫
    pen holder=笔筒
    notebook stand=笔记本支架
    office shelf=办公架
    coat rack=衣帽架
    privacy screen=隐私挡板
    acoustic baffle=吸音吊片
    ceiling panel=天花板
    floor box=地面接线盒
    carpet strip=地毯条
    chair roller=座椅滚轮
    monitor cable=显示器线
    keyboard tray=键盘托
    workstation leg=工作站桌腿
    footrest=脚踏
    desk partition=桌面分隔板
    cable sleeve=线缆套
  `),
  group("office-building", "conference-room", "conference-detail", `
    conference folder=会议文件夹
    conference display=会议显示屏
    display remote=显示器遥控器
    camera mount=摄像机支架
    microphone array=麦克风阵列
    speaker bar=扬声器条
    table runner=桌旗
    blind track=百叶轨道
    blackout blind=遮光帘
    acoustic curtain=吸音帘
    sideboard=餐边柜
    credenza=会议边柜
    flip chart=活动挂图
    presentation clicker=演示翻页器
    pen cup=笔杯
    notepad=便笺本
    water carafe=水壶
    glass tumbler=玻璃杯
    table power module=桌面电源模块
    wall outlet=墙面插座
    glass door=玻璃门
    camera tripod=摄像机三脚架
    lens hood=镜头遮光罩
    ceiling microphone=天花麦克风
    projector lens=投影镜头
    screen cable=屏幕线缆
    conference badge=会议证
    remote tray=遥控器托盘
    tabletop grommet=桌面走线孔
    chair swivel=座椅旋转件
  `),
  group("office-building", "service-core", "service-core-detail", `
    mechanical room=机房
    electrical room=配电间
    data center=数据中心
    lift shaft=电梯井
    switchgear cabinet=开关柜
    electrical panel=配电面板
    breaker panel=断路器面板
    transformer cabinet=变压器柜
    UPS cabinet=不间断电源柜
    battery cabinet=电池柜
    server blade=服务器刀片
    rack shelf=机架层板
    patch cord=跳线
    fiber panel=光纤面板
    network cable=网线
    cable ladder=电缆梯架
    supply riser=供给立管
    chilled water pipe=冷冻水管
    ventilation grille=通风格栅
    return air duct=回风管
    filter rack=过滤器架
    access hatch=检修口
    sprinkler valve=喷淋阀
    fire hose reel=消防卷盘
    smoke detector=烟雾探测器
    alarm beacon=报警信标
    service door=设备门
    maintenance rail=检修栏杆
    duct elbow=风管弯头
    pipe flange=管道法兰
  `),

  group("city-street", "museum-columns", "museum-facade", `
    portico=门廊
    entablature=柱顶盘
    frieze=檐壁
    cornice=檐口
    pilaster=壁柱
    door transom=门上亮窗
    stone lintel=石门楣
    stair tread=楼梯踏步
    entry handrail=入口扶手
    door jamb=门框侧柱
    threshold strip=门槛条
    column base=柱基
    capital volute=柱头涡卷
    column fluting=柱身凹槽
    facade block=立面石块
    window mullion=窗竖梃
    museum sill=博物馆窗台
    display pedestal=展品基座
    exhibit plinth=展台底座
    mineral facet=矿物切面
    rock specimen=岩石标本
    entry mat=入口地垫
    brass rail=黄铜栏杆
    facade joint=立面接缝
    stone step=石台阶
    door hinge=门铰链
    door glazing=门玻璃
    case frame=展柜框
    exhibit mount=展品支架
    ceiling beam=天花梁
  `),
  group("city-street", "street-intersection", "street-mobility", `
    lane divider=车道分隔线
    asphalt seam=沥青接缝
    curb edge=路缘边
    tactile tile=盲道砖
    sidewalk grate=人行道格栅
    hydrant chain=消防栓链
    bollard ring=护柱环
    bike pedal=自行车脚踏
    bike saddle=自行车座
    bike basket=自行车篮
    car mirror=汽车后视镜
    car hood=汽车引擎盖
    signal housing=信号灯壳
    signal pole=信号灯杆
    lamp bracket=路灯支架
    lamp base=路灯底座
    sidewalk slab=人行道板
    curb joint=路缘接缝
    ramp edge=坡道边
    road stud=道路道钉
    planter bowl=花盆
    bench armrest=长椅扶手
    tree grate=树池格栅
    crosswalk end=斑马线端
    street drain=街道排水口
    curb stone face=缘石立面
    sidewalk joint=人行道接缝
    bicycle chain=自行车链条
    wheel rim=车轮轮缘
    road seam=道路接缝
  `),
  group("transit-hub", "verified-platform", "railway-zone", `
    rail head=钢轨顶面
    rail web=钢轨腹板
    rail foot=钢轨底座
    sleeper pad=轨枕垫
    ballast stone=道砟
    platform tile=站台砖
    tactile strip=盲道带
    rail joint=钢轨接头
    fishplate=鱼尾板
    track bolt=轨道螺栓
    rail clip=钢轨夹
    fastener plate=扣件底板
    sleeper end=轨枕端面
    ballast pocket=道砟凹槽
    platform drain=站台排水口
    edge coping=边缘压顶
    platform cap=站台压条
    platform fascia=站台立面
    tactile edge=盲道边
    platform bracket=站台支架
    platform post=站台立柱
    bench bolt=长椅螺栓
    bin lid=垃圾桶盖
    floor expansion joint=地面伸缩缝
    tile grout=地砖填缝
    drain channel=排水槽
    platform marker=站台标记
    rail shadow=钢轨阴影
    sleeper corner=轨枕角
    ballast edge=道砟边
  `),
  group("science-museum", "dinosaur-skeleton", "dinosaur-gallery", `
    osteoderm=骨甲
    vertebra facet=椎骨关节面
    rib shaft=肋骨骨干
    tail joint=尾椎关节
    claw sheath=爪鞘
    horn ridge=角脊
    jaw socket=颌骨关节窝
    tooth root=牙根
    bone fragment=骨片
    fossil matrix=化石基质
    specimen mount=标本支架
    fossil stand=化石底座
    museum rail=展区栏杆
    case hinge=展柜铰链
    case latch=展柜卡扣
    bone bracket=骨骼托架
    skeleton foot=骨架足部
    pelvis joint=骨盆关节
    ankle bone=踝骨
    toe claw=趾爪
    fossil texture=化石纹理
    mineral vein=矿物纹理
    display riser=展台升台
    plinth edge=底座边缘
    support rod=支撑杆
    rib joint=肋骨连接
    skull opening=头骨孔
    jaw ridge=颌骨脊
    tooth enamel=牙釉质
    bone shadow=骨骼阴影
  `),
  group("city-park", "verified-pond", "pond-habitat-detail", `
    shoreline pebble=岸边卵石
    waterline ripple=水线波纹
    reed node=芦苇节
    reed sheath=芦苇鞘
    lily pad notch=睡莲叶缺口
    lily pad stem=睡莲叶柄
    water lily stamen=睡莲雄蕊
    pond pebble=池塘卵石
    duck beak=鸭嘴
    duck eye=鸭眼
    duck feather=鸭羽
    water shadow=水面倒影
    ripple crest=波纹脊
    bank pebble=岸坡石
    shore mud=岸泥
    water edge=水边
    bridge rail joint=桥栏接缝
    bridge post cap=桥柱帽
    bridge deck grain=桥面木纹
    stone arch=石拱
    path paver=小路铺石
    lily leaf vein=睡莲叶脉
    reed blade tip=芦苇叶尖
    duck tail=鸭尾
    duck neck=鸭颈
    water reflection=水面反光
    pond surface=池塘水面
    shoreline curve=岸线弧面
    rock lichen=石面地衣
    aquatic leaf=水生叶片
  `),
  group("community-garden", "greenhouse-bay", "greenhouse-zone", `
    glazing bar=玻璃压条
    roof ridge=屋脊
    roof pane=屋顶玻璃片
    door latch=门闩
    door hinge=门铰链
    downpipe elbow=落水管弯头
    gutter bracket=檐沟支架
    bench tray=工作台托盘
    seed plug=育苗块
    seedling cell=育苗格
    tomato truss=番茄果穗
    tomato calyx=番茄萼片
    tomato leaf vein=番茄叶脉
    bean tendril=豆蔓卷须
    kale rib=羽衣甘蓝叶脉
    carrot crown=胡萝卜冠部
    soil crumb=土壤颗粒
    bed corner=种植床角
    timber joint=木材接缝
    trellis knot=棚架结点
    pot saucer=花盆托盘
    bench leg=工作台桌腿
    glazing seal=玻璃密封条
    frame corner=框架角
    vent handle=通风窗把手
    roof bolt=屋顶螺栓
    shelf lip=货架边
    tray rim=托盘边缘
    plant stake=植物支杆
    vine tie=藤蔓绑带
  `),

  group("hospital", "operating-theatre", "operating-theatre-detail", `
    suction unit=吸引器
    suction canister=吸引罐
    diathermy unit=电刀机
    cautery pencil=电凝笔
    electrosurgical pad=电极垫
    anesthesia screen=麻醉屏
    breathing circuit=呼吸回路
    oxygen mask=氧气面罩
    airway tube=气道管
    table strap=手术台固定带
    shoulder support=肩托
    arm board=臂板
    leg support=腿托
    heel pad=脚跟垫
    mayo stand=梅奥台
    back table=器械后桌
    prep table=术前准备台
    sterile bowl=无菌碗
    kidney dish=肾形盘
    sponge bowl=海绵碗
    scrub brush=刷手刷
    shoe cover=鞋套
    sterile glove=无菌手套
    gown tie=手术衣系带
    drape clip=铺单夹
    instrument handle=器械柄
    retractor=牵开器
    needle holder=持针器
    sharps bin=锐器盒
    waste bag=废物袋
  `),
  group("pathology-lab", "cold-storage", "cold-storage-detail", `
    cryostat=冰冻切片机
    cryostat chamber=冰冻腔
    cryostat blade=冰冻刀片
    frozen block=冰冻蜡块
    cold chain=冷链
    ice pack=冰袋
    cooling rack=冷却架
    chilled tray=冷藏托盘
    cryovial=冻存管
    cryo box=冻存盒
    freezer rack=冷冻架
    sample drawer=样本抽屉
    cold drawer=冷藏抽屉
    frost line=霜线
    temperature dial=温度旋钮
    temperature probe=温度探头
    door latch=门闩
    door handle=门把手
    shelf bracket=层板支架
    shelf divider=层板隔板
    storage bin=储存箱
    vial cradle=试管托架
    tube sleeve=试管套
    insulated lid=保温盖
    coolant pipe=冷却管
    vent grille=通风格栅
    ice crystal=冰晶
    frost patch=霜斑
    cabinet key=柜门钥匙
    cold room threshold=冷室门槛
  `),
  group("hospital-pharmacy", "mobile-cart", "mobile-cart-detail", `
    drawer cart=抽屉车
    locking drawer=锁定抽屉
    cart brake=推车制动器
    wheel guard=车轮护罩
    push bar=推杆
    side panel=侧板
    end panel=端板
    supply drawer=物资抽屉
    dose cup rack=量杯架
    syringe tray=注射器托盘
    glove box=手套盒
    gauze pack=纱布包
    dressing pack=敷料包
    label sleeve=标签套
    barcode tag=条码标签
    stock bin=库存箱
    reorder card=补货卡
    seal strip=封条
    package flap=包装翻盖
    foil pouch=铝箔袋
    cart divider=推车隔板
    basket handle=篮子把手
    bottle holder=瓶托
    vial holder=药瓶托
    tray liner=托盘衬垫
    safety rail=安全栏杆
    corner bumper=护角
    caster brake=脚轮制动
    cart shelf mat=推车层垫
    supply label=物资标签
  `),
  group("airport", "baggage-claim", "baggage-claim-detail", `
    claim chute=行李滑槽
    chute door=滑槽门
    oversize belt=超规行李带
    claim monitor=提取显示器
    carousel island=转盘岛台
    luggage trolley bay=行李车位
    lost baggage desk=失物行李台
    arrival door=到达门
    customs barrier=海关隔栏
    claim inspection table=提取检查台
    trolley queue=行李车队列
    carousel motor=转盘电机
    roller housing=滚筒护罩
    carousel guide=转盘导轨
    carousel hub=转盘中心
    carousel cover=转盘护罩
    slat hinge=板条铰链
    rubber skirt=橡胶裙边
    baggage tub=行李槽
    bag wheel=行李轮
    bag corner=行李角
    tag pocket=行李牌袋
    claim ticket=提取票
    counter tray=柜台托盘
    arrival gate=到达闸门
    floor bollard=地面护柱
    claim barrier=提取隔栏
    cart rail=行李车栏
    trolley deck=行李车底板
    carousel edge=转盘边缘
  `),
  group("office-building", "service-core", "service-core-detail", `
    fan coil=风机盘管
    air filter=空气滤网
    filter frame=滤网框
    volume damper=风量调节阀
    duct grille=风管格栅
    duct collar=风管套环
    pipe valve=管道阀
    valve handle=阀门把手
    pressure gauge=压力表
    flow meter=流量计
    meter cabinet=仪表柜
    conduit box=线管盒
    conduit strap=线管卡箍
    cable trunk=电缆槽
    cable gland=电缆密封套
    switch handle=开关把手
    busbar cover=母线护盖
    breaker lever=断路器扳手
    power meter=电力表
    emergency light=应急灯
    exit light=出口灯
    sprinkler head=喷淋头
    fire hose=消防水带
    smoke alarm=烟雾报警器
    fire door=防火门
    access panel=检修面板
    service ladder=检修梯
    floor drain=地漏
    pipe elbow=管道弯头
    ceiling hatch=天花检修口
  `),

  group("apartment", "verified-living-room", "living-room-detail", `
    ottoman=脚凳
    sofa cushion=沙发垫
    sofa seam=沙发缝
    armchair=扶手椅
    chair cushion=椅垫
    coffee table shelf=茶几搁板
    table edge=桌边
    table foot=桌脚
    floor runner=地毯
    rug corner=地毯角
    lamp stem=灯杆
    lamp cord=灯线
    lamp switch=灯开关
    media shelf=媒体架
    speaker=音箱
    remote control=遥控器
    picture glass=相框玻璃
    frame mat=画框卡纸
    vase rim=花瓶口
    vase neck=花瓶颈
    plant stem=植物茎
    leaf vein=叶脉
    curtain hem=窗帘边
    curtain fold=窗帘褶
    floorboard joint=地板接缝
    skirting trim=踢脚线
    wall socket=墙面插座
    ceiling beam=天花梁
    door hinge=门铰链
    door latch=门闩
  `),
  group("kitchen", "verified-kitchen-island", "preparation-island", `
    colander=漏篮
    saucepan=奶锅
    saucepan lid=奶锅盖
    casserole dish=焗烤盘
    baking tray=烤盘
    loaf pan=吐司模
    oven mitt=隔热手套
    apron=围裙
    utensil crock=厨具筒
    ladle=汤勺
    spatula=锅铲
    tongs=夹子
    peeler=削皮器
    grater=刨丝器
    measuring spoon=量匙
    timer=计时器
    salt cellar=盐罐
    pepper shaker=胡椒罐
    oil bottle=油瓶
    vinegar bottle=醋瓶
    cutting mat=切菜垫
    board handle=砧板把手
    dish stack=餐盘叠
    glass jar=玻璃罐
    storage tin=储物罐
    pantry basket=储藏篮
    island drawer front=岛台抽屉面
    cabinet shelf=柜内搁板
    countertop seam=台面接缝
    island support=岛台支撑
  `),
  group("bedroom", "verified-bed", "sleeping-area", `
    mattress seam=床垫缝
    fitted sheet=床笠
    sheet corner=床单角
    duvet cover=被套
    duvet seam=被套缝
    blanket fringe=毯子流苏
    pillow insert=枕芯
    pillow edge=枕边
    pillow piping=枕头滚边
    bed runner=床尾巾
    bedspread=床罩
    bolster=长枕
    headboard rail=床头板横梁
    headboard button=床头扣
    bed slat=床板条
    bedside shelf=床头搁板
    bedside drawer pull=床头抽屉拉手
    reading lamp=阅读灯
    lamp cord=灯线
    curtain tie=窗帘绑带
    curtain lining=窗帘衬
    rug pile=地毯绒面
    rug corner=地毯角
    floor knot=地板纹理
    wall molding=墙面线脚
    window latch=窗锁
    window frame=窗框
    coat hook plate=衣帽钩底板
    laundry rim=洗衣篮边
    plant pot rim=花盆边
  `),
  group("bathroom", "verified-shower", "shower-area", `
    overflow cover=溢水口盖
    faucet aerator=水龙头起泡器
    bath plug=浴缸塞
    drain stopper=排水塞
    tub side panel=浴缸侧板
    tray divider=托盘隔板
    washcloth corner=毛巾角
    tap base=水龙头底座
    vanity backsplash=盥洗台挡水板
    basin overflow=洗手盆溢水口
    drawer organizer=抽屉分隔盒
    cabinet shelf=柜内搁板
    mirror light=镜前灯
    mirror clip=镜夹
    sconce shade=壁灯灯罩
    toothbrush handle=牙刷柄
    toothpaste tube=牙膏管
    floss box=牙线盒
    toilet hinge=马桶铰链
    toilet lid hinge=马桶盖铰链
    flush plate=冲水面板
    paper roll core=纸卷芯
    shower riser=淋浴立管
    mixer lever=混水阀杆
    hose connector=软管接头
    niche back=壁龛背板
    bench drain=淋浴凳排水
    tile edge=瓷砖边
    grout line=填缝线
    towel seam=毛巾缝
  `),
  group("city-cafe", "verified-display-case", "counter-pastries", `
    pastry box=糕点盒
    tart shell=挞皮
    pastry glaze=糕点糖衣
    muffin top=马芬顶部
    croissant tip=牛角包尖
    bread crumb=面包屑
    bun crust=面包卷外皮
    display shelf=展示架
    display riser=展示台阶
    glass shelf=玻璃层板
    tray liner=托盘衬垫
    serving tong=食品夹
    cake knife=蛋糕刀
    dessert fork=甜点叉
    sugar sachet=方糖包
    stir stick=搅拌棒
    teaspoon=茶匙
    saucer rim=碟边
    coffee spoon=咖啡匙
    milk jug=牛奶壶
    cream pitcher=奶油壶
    carafe stopper=水壶塞
    grinder hopper lid=研磨机料斗盖
    grinder burr=研磨刀盘
    portafilter basket=粉碗
    group head gasket=冲煮头密封圈
    steam knob=蒸汽旋钮
    pressure dial=压力表盘
    counter shelf=柜台搁板
    floor grout=地面填缝
  `),

  group("electric-bus", "verified-window", "passenger-cabin", `
    window frame=车窗框
    window seal=车窗密封条
    window latch=车窗锁扣
    window mullion=车窗竖梃
    glazing bead=玻璃压条
    seat upholstery=座椅面料
    seat edge=座椅边缘
    seat bracket=座椅支架
    seat mount=座椅底座
    seat hinge=座椅铰链
    seatback pocket=椅背袋
    seat armrest=座椅扶手
    seat frame=座椅框架
    aisle rail=过道栏杆
    grab pole=抓杆
    grab strap=抓带
    overhead light=顶灯
    ceiling panel=顶板
    floor channel=地板线槽
    aisle floor=过道地板
    wheelchair strap=轮椅固定带
    wheelchair ramp=轮椅坡板
    interior panel=内饰板
    handrail bracket=扶手支架
    handrail cap=扶手端盖
    emergency hammer=安全锤
    air vent=出风口
    speaker grille=扬声器格栅
    door sill=车门门槛
    door seal=车门密封条
  `),
  group("battery", "verified-enclosure", "pack-shell", `
    cooling plate fin=冷却板翅片
    cooling manifold=冷却歧管
    hose clamp=软管卡箍
    coolant elbow=冷却液弯头
    thermal interface=导热界面
    heat spreader=散热片
    module separator=模块隔板
    pack rail=电池包导轨
    shell corner=外壳角
    lid hinge=上盖铰链
    lid seal=上盖密封条
    enclosure wall=外壳壁
    corner bracket=角支架
    base flange=底座法兰
    fastener head=紧固件头
    vent cover=通风盖
    pressure plate=压板
    terminal cover=端子护盖
    busbar strap=母排带
    fuse holder=保险丝座
    contactor bracket=接触器支架
    service loop=维修余线
    cable sleeve=线缆套
    cable bend=线缆弯
    connector body=连接器壳体
    electrical lug=电气接线耳
    module end bolt=模块端螺栓
    cell can edge=电芯壳边
    holder slot=电芯座槽
    insulation tab=绝缘片耳
  `),
  group("railway-platform", "verified-track", "track-structure", `
    rail web=钢轨腹板
    rail foot=钢轨底座
    fishplate=鱼尾板
    fishplate bolt=鱼尾板螺栓
    sleeper pad=轨枕垫
    sleeper end=轨枕端面
    ballast pocket=道砟凹槽
    rail clip=钢轨夹
    clip bolt=扣件螺栓
    baseplate=轨道底板
    baseplate bolt=底板螺栓
    tie plate=垫板
    rail splice=钢轨接缝
    rail weld=钢轨焊缝
    rail anchor=钢轨锚固件
    track fastener=轨道扣件
    track bolt=轨道螺栓
    sleeper corner=轨枕角
    ballast pebble=道砟小石
    ballast edge=道砟边
    platform joint=站台接缝
    edge stone=边缘石
    tactile tile=盲道砖
    warning dot=警示点
    platform seam=站台缝
    rail shadow=钢轨阴影
    sleeper grain=轨枕木纹
    ballast gap=道砟间隙
    rail side=钢轨侧面
    fastener washer=扣件垫圈
  `),
  group("train-carriage", "verified-bogie-frame", "bogie-assembly", `
    bogie bolster=转向架摇枕
    axle bearing=轴承
    spring seat=弹簧座
    brake shoe=闸瓦
    brake hose coupling=制动软管接头
    brake pipe=制动管
    air valve=空气阀
    traction cable=牵引电缆
    motor mount=电机支座
    gearbox cover=齿轮箱护盖
    wheel flange=车轮轮缘
    wheel hub cap=轮毂盖
    axle collar=车轴套环
    axle end=车轴端
    suspension bracket=悬挂支架
    damper pin=减振器销
    bogie cross beam=转向架横梁
    frame rib=构架加强筋
    frame weld=构架焊缝
    side skirt panel=侧裙板
    underframe bracket=底架支架
    equipment hatch=设备舱盖
    grounding strap=接地带
    coupler lock=车钩锁
    coupler shank=车钩杆
    buffer plate=缓冲器端板
    buffer spring=缓冲弹簧
    floor beam=底架横梁
    track bracket=轨道支架
    wheel bearing=车轮轴承
  `),
  group("rail-bogie", "verified-bogie-frame", "frame-and-secondary-suspension", `
    frame gusset=构架角撑
    frame rib plate=构架肋板
    weld bead=焊缝凸起
    side frame pocket=侧架凹槽
    cross beam bolt=横梁螺栓
    pivot bushing=中心销衬套
    pivot washer=中心销垫圈
    spring coil=弹簧线圈
    spring guide=弹簧导向件
    damper eye=减振器环眼
    damper rod=减振器杆
    air spring plate=空气弹簧板
    air spring bolt=空气弹簧螺栓
    axle guide=车轴导向件
    bearing cap=轴承盖
    bearing retainer=轴承保持架
    brake hose clamp=制动软管卡箍
    cable lug=电缆接线耳
    conduit saddle=导管鞍座
    grounding lug=接地接线耳
    frame corner=构架角
    frame rail=构架纵梁
    cross brace=交叉撑杆
    bolster plate=摇枕板
    suspension seat=悬挂座
    suspension pin=悬挂销
    wheelset guard=轮对护罩
    gearbox flange=齿轮箱法兰
    motor bracket=电机支架
    brake bracket=制动支架
  `),

  group("blood-cell", "red-cell-cutaway", "red-cell-cutaway-zone", `
    membrane pore=膜孔
    lipid tail=脂质尾
    membrane channel=膜通道
    spectrin node=血影蛋白节点
    actin filament=肌动蛋白丝
    ankyrin link=锚蛋白连接
    cytoskeleton mesh=细胞骨架网
    cytoplasm vesicle=细胞质囊泡
    cell edge=细胞边缘
    cell contour=细胞轮廓
    rim highlight=边缘高光
    central dimple=中央凹陷
    membrane fold=膜褶皱
    bilayer edge=双层膜边缘
    protein channel=蛋白通道
    hemoglobin pocket=血红蛋白凹袋
    protein cluster=蛋白簇
    cytosol pocket=细胞质基质凹袋
    red cell disc=红细胞圆盘
    red cell edge=红细胞边缘
    neutrophil granule=中性粒细胞颗粒
    neutrophil nucleus=中性粒细胞细胞核
    nuclear bridge=细胞核连接
    granule membrane=颗粒膜
    platelet vesicle=血小板囊泡
    platelet process=血小板突起
    plasma stream=血浆流带
    cell overlap=细胞重叠
    surface highlight=表面高光
    cell interior=细胞内部
  `),
  group("heart", "artery-cutaway", "artery-cutaway-zone", `
    lumen edge=腔缘
    intima layer=内膜层
    media layer=中膜层
    adventitia layer=外膜层
    elastic lamella=弹性板层
    smooth muscle band=平滑肌带
    endothelium cell=内皮细胞
    vessel branch=血管分支
    branch opening=分支开口
    arterial ring=动脉环
    blood cell rim=血细胞边缘
    cell cluster=细胞簇
    vessel outer wall=血管外壁
    vessel inner wall=血管内壁
    wall fold=血管壁褶皱
    vessel split=血管分叉
    vessel lumen=血管腔
    artery cut edge=动脉切面边缘
    tissue rim=组织边缘
    vessel shadow=血管阴影
    coronary opening=冠状动脉开口
    vein wall=静脉壁
    vessel junction=血管连接处
    capillary opening=毛细血管开口
    vessel surface=血管表面
    branch ridge=分支脊
    artery base=动脉基部
    cutaway frame=剖面框
    tissue pad=组织垫
    red cell pocket=红细胞凹袋
  `),
  group("human-body", "skeleton-upper", "skeleton-upper-zone", `
    brow=眉弓
    cheekbone=颧骨
    eye socket=眼眶
    nasal bone=鼻骨
    jawline=下颌线
    neck muscle=颈部肌肉
    shoulder blade=肩胛骨
    rib arch=肋弓
    sternum ridge=胸骨脊
    spine curve=脊柱曲线
    pelvic rim=骨盆缘
    hip socket=髋臼
    knee joint=膝关节
    ankle joint=踝关节
    toe joint=趾关节
    finger joint=指关节
    thumb joint=拇指关节
    elbow joint=肘关节
    wrist joint=腕关节
    shin crest=胫骨嵴
    calf contour=小腿轮廓
    biceps belly=肱二头肌腹
    triceps belly=肱三头肌腹
    deltoid edge=三角肌边缘
    quadriceps tendon=股四头肌腱
    abdominal ridge=腹肌脊
    muscle fascia=肌肉筋膜
    organ outline=器官轮廓
    lung lobe=肺叶
    liver edge=肝脏边缘
  `),
  group("hemoglobin", "verified-globin-fold", "alpha-folds", `
    alpha chain=α链
    beta chain=β链
    globin helix=珠蛋白螺旋
    helix turn=螺旋转折
    helix loop=螺旋环
    ribbon edge=带状边缘
    subunit seam=亚基接缝
    tetramer center=四聚体中心
    heme pocket wall=血红素凹袋壁
    heme iron=血红素铁
    porphyrin plane=卟啉平面
    oxygen contact=氧接触点
    iron coordination=铁配位
    heme propionate=血红素丙酸基
    heme methyl=血红素甲基
    globin surface=珠蛋白表面
    chain interface=链界面
    subunit groove=亚基沟槽
    protein ridge=蛋白脊
    ribbon bend=带状弯曲
    ribbon tip=带状尖端
    helix cap=螺旋帽
    loop bridge=环桥
    tetramer face=四聚体表面
    cavity edge=空腔边缘
    alpha fold=α折叠
    beta fold=β折叠
    side chain=侧链
    pocket wall=凹袋壁
    fold junction=折叠连接
  `),
  group("oxygen-molecule", "verified-diffusion-trail", "molecule-path", `
    gas molecule=气体分子
    carbon dioxide pair=二氧化碳分子对
    diffusion front=扩散前沿
    molecule trail=分子轨迹
    airway opening=气道开口
    airway wall=气道壁
    capillary wall edge=毛细血管壁缘
    plasma gap=血浆间隙
    membrane pore=膜孔
    surfactant film=表面活性物质薄膜
    alveolar cell edge=肺泡细胞边缘
    endothelial edge=内皮边缘
    red cell surface=红细胞表面
    hemoglobin site=血红蛋白位点
    oxygen bond=氧键
    molecular pair=分子对
    atom center=原子中心
    bond line=键线
    carbon sphere=碳球
    gas cluster=气体簇
    molecule path=分子路径
    trail segment=轨迹段
    air interface=空气界面
    alveolar seam=肺泡接缝
    barrier edge=屏障边缘
    capillary seam=毛细血管接缝
    diffusion band=扩散带
    molecule spacing=分子间距
    blood pocket=血液凹袋
    pore rim=孔缘
  `),

  group("hospital", "emergency-department", "emergency-department-detail", `
    triage room=分诊室
    resuscitation bay=复苏间
    crash cart=抢救车
    defibrillator=除颤器
    ECG monitor=心电监护仪
    pulse oximeter=脉搏血氧仪
    blood pressure cuff=血压袖带
    clinical thermometer=临床体温计
    exam stool=检查凳
    sharps container=锐器盒
    hand sanitizer=免洗消毒液
    glove dispenser=手套分配器
    mask dispenser=口罩分配器
    privacy track=隐私帘轨道
    call panel=呼叫面板
    wall clock=挂钟
    observation window=观察窗
    sliding partition=滑动隔断
    waiting chair=候诊椅
    reception window=接待窗口
    patient wristband=患者腕带
    specimen cup=标本杯
    urine bag=尿袋
    IV pump=输液泵
    IV line=输液管
    bed curtain=床帘
    exam lamp=检查灯
    blanket warmer=保温柜
    sanitizer bracket=消毒液支架
    wheelchair brake=轮椅刹车
  `),
  group("pathology-lab", "embedding-station", "embedding-station-detail", `
    microtome handwheel=切片机手轮
    blade holder=刀片夹座
    disposable blade=一次性刀片
    thickness dial=厚度旋钮
    section bath=切片水浴
    wax tray=石蜡托盘
    paraffin pellet=石蜡颗粒
    wax spatula=石蜡刮铲
    mold rack=包埋模架
    cassette holder=包埋盒夹
    embedding mold lid=包埋模盖
    cooling plate=冷却板
    hot plate surface=加热板面
    dispenser handle=分配器把手
    wax scraper=蜡刮片
    trim bin=修整废料盒
    microtome base=切片机底座
    handwheel spoke=手轮辐条
    ribbon guide=切片带导向件
    trimming tray=修整托盘
    wax drain=蜡液排口
    cassette latch=包埋盒卡扣
    mold hinge=模具铰链
    block carrier=蜡块托架
    specimen cassette=标本包埋盒
    blade release=刀片释放杆
    section pick=切片拾取镊
    wax collar=蜡液环
    mold clamp=模具夹
    bench guard=工作台护挡
  `),
  group("hospital-pharmacy", "medicine-shelves", "medicine-shelves-detail", `
    azithromycin=阿奇霉素
    amoxicillin=阿莫西林
    cefalexin=头孢氨苄
    clarithromycin=克拉霉素
    erythromycin=红霉素
    levofloxacin=左氧氟沙星
    rifampicin=利福平
    linezolid=利奈唑胺
    valacyclovir=伐昔洛韦
    nystatin=制霉菌素
    metoprolol=美托洛尔
    atenolol=阿替洛尔
    candesartan=坎地沙坦
    irbesartan=厄贝沙坦
    amiloride=阿米洛利
    glipizide=格列吡嗪
    insulin glargine=甘精胰岛素
    atorvastatin=阿托伐他汀
    simvastatin=辛伐他汀
    dabigatran=达比加群
    prasugrel=普拉格雷
    prednisone=泼尼松
    dexamethasone=地塞米松
    torsemide=托拉塞米
    pantoprazole=泮托拉唑
    famotidine=法莫替丁
    granisetron=格拉司琼
    lidocaine=利多卡因
    medicine vial=药品小瓶
    child resistant cap=儿童安全盖
  `),
  group("airport", "airside-apron", "airside-detail", `
    runway threshold=跑道入口
    runway shoulder=跑道道肩
    taxiway edge=滑行道边缘
    holding bay=等待位
    apron joint=机坪接缝
    stand marking=机位标线
    aircraft beacon=航空器信标灯
    navigation light=航行灯
    wing root fairing=翼根整流罩
    flap hinge=襟翼铰链
    engine pylon=发动机挂架
    exhaust nozzle=排气喷口
    fan spinner=风扇锥体
    landing gear door=起落架舱门
    wheel chock=轮挡
    cargo loader=货物装卸车
    belt loader=皮带装卸车
    catering truck=配餐车
    deicing truck=除冰车
    ground power unit=地面电源车
    tow bar=牵引杆
    pushback bar=推出杆
    marshaller paddle=引导员指挥板
    safety cone=安全锥
    blast pad=喷流防护坪
    runway shoulder light=道肩灯
    taxiway sign=滑行道标志
    perimeter fence=周界围栏
    tower window=塔台窗
    jet bridge canopy=登机桥顶棚
  `),
  group("office-building", "service-core", "service-core-detail", `
    lift indicator=电梯指示器
    elevator jamb=电梯门框
    elevator sill=电梯门槛
    hoistway door=电梯井门
    stair stringer=楼梯梁
    handrail bracket=扶手支架
    landing edge=平台边缘
    riser panel=立管面板
    cable tray rung=电缆桥架横档
    ladder rung=梯子横档
    server rail=服务器导轨
    rack handle=机架把手
    patch cord latch=跳线卡扣
    fiber tray=光纤托盘
    cable splice=电缆接头
    conduit fitting=导管接头
    busbar terminal=母线端子
    disconnect switch=隔离开关
    fuse holder=熔断器座
    panel hinge=面板铰链
    panel latch=面板卡扣
    access reader=门禁读卡器
    fire alarm strobe=火灾报警闪光灯
    sprinkler escutcheon=喷淋装饰盖
    smoke detector base=烟感底座
    duct register=风管风口
    damper blade=风阀叶片
    pipe support=管道支架
    service-core threshold=设备核心门槛
    rack identification plate=机架识别牌
  `),
  group("city-street", "museum-columns", "museum-facade", `
    museum pediment=博物馆山花
    pediment relief=山花浮雕
    architrave=柱顶梁
    column drum=柱身鼓段
    column plinth=柱基座
    fluting groove=凹槽纹
    door casing=门套
    door sill=门槛石
    hinge plate=铰链板
    transom pane=横楣玻璃
    threshold stone=门槛石材
    cornice block=檐口块
    facade pilaster=立面壁柱
    stone cladding=石材饰面
    masonry joint=砌体接缝
    window reveal=窗洞侧壁
    display case hinge=展柜铰链
    exhibit label rail=展签导轨
    display shelf=展示搁板
    mounting bracket=安装支架
    museum lantern=博物馆灯
    entry canopy=入口雨棚
    step nosing=踏步前缘
    handrail post=扶手立柱
    door closer=闭门器
    brass hinge=黄铜铰链
    glass seal=玻璃密封条
    roof gutter=屋面天沟
    drain spout=排水嘴
    facade bracket=立面托架
  `),
  group("transit-hub", "verified-platform", "railway-zone", `
    platform canopy=站台雨棚
    platform canopy beam=雨棚梁
    platform canopy column=雨棚柱
    platform screen door=站台屏蔽门
    boarding marker=上车标记
    edge warning strip=边缘警示带
    tactile stud=触觉凸点
    platform drain grate=站台排水格栅
    bench back=长椅靠背
    bench seat=长椅座面
    seat arm=座椅扶手
    ticket validator=车票验票机
    fare gate hinge=闸机铰链
    escalator handrail=扶梯扶手带
    escalator comb=扶梯梳齿板
    lift door=电梯门
    lift sill=电梯门槛
    concourse tile=大厅地砖
    concourse joint=大厅接缝
    wayfinding panel=导向面板
    platform speaker=站台扬声器
    ceiling diffuser=天花散流器
    vent grille=通风格栅
    fire hose cabinet=消防水带箱
    emergency call point=紧急呼叫点
    platform light=站台灯
    trackside cabinet=轨旁柜
    rail insulator=钢轨绝缘件
    overhead mast=接触网立柱
    platform shelter=站台候车亭
  `),
  group("science-museum", "dinosaur-skeleton", "dinosaur-gallery", `
    zygomatic arch=颧弓
    orbital rim=眶缘
    nasal crest=鼻嵴
    tooth socket=牙槽
    jaw symphysis=下颌联合
    cervical vertebra=颈椎
    dorsal vertebra=背椎
    caudal vertebra=尾椎
    rib head=肋骨头
    scapular blade=肩胛骨板
    humerus shaft=肱骨骨干
    ulna shaft=尺骨骨干
    radius shaft=桡骨骨干
    metacarpal=掌骨
    phalanx=指骨
    femoral head=股骨头
    tibia shaft=胫骨骨干
    fibula shaft=腓骨骨干
    metatarsal=跖骨
    claw base=爪基
    osteoderm row=骨皮板列
    tail chevron=尾椎人字骨
    vertebral arch=椎弓
    neural spine=神经棘
    pelvis blade=骨盆翼
    acetabulum=髋臼
    fossil matrix grain=化石基质纹理
    skeletal mount=骨骼支架
    support cable=支撑缆线
    bone surface=骨表面
  `),
  group("city-park", "verified-pond", "pond-habitat-detail", `
    shoreline shelf=岸缘台阶
    pond inlet=池塘入口
    pond outlet=池塘出口
    bridge underside=桥底
    bridge joist=桥托梁
    bridge bolt=桥梁螺栓
    handrail post=扶手立柱
    bank root=岸边树根
    mud bank=泥岸
    water glint=水面闪光
    ripple ring=涟漪环
    bubble trail=气泡串
    duck foot=鸭足
    lily underside=睡莲叶背
    lily stem=睡莲茎
    reed tassel=芦苇穗
    bridge rail post=桥栏立柱
    bridge rail slat=桥栏横板
    bridge deck plank=桥面木板
    pond rock face=池石表面
    lily pad rim=睡莲叶缘
    lily flower center=睡莲花心
    duck bill=鸭嘴
    reed clump=芦苇丛
    water surface=水面
    shoreline stone=岸边石
    moss patch=苔藓斑
    stone edge=石头边缘
    pond reflection=池塘倒影
    shoreline bank=岸线
  `),
  group("community-garden", "greenhouse-bay", "greenhouse-zone", `
    greenhouse frame joint=温室框架接头
    greenhouse ridge cap=温室脊盖
    glazing clip=玻璃卡夹
    glass gasket=玻璃垫圈
    door threshold=门槛
    vent hinge=通风窗铰链
    vent louver=通风百叶
    roof flashing=屋面泛水
    gutter seam=天沟接缝
    downspout outlet=落水管出口
    bench crossbar=工作台横梁
    bench brace=工作台撑杆
    tray divider=托盘隔条
    seedling cotyledon=幼苗子叶
    leaf node=叶节
    stem internode=茎节间
    flower sepal=花萼片
    pollen anther=花药
    petal vein=花瓣脉
    trellis post=藤架立柱
    trellis wire=藤架铁丝
    bean pod=豆荚
    tomato pedicel=番茄果梗
    tomato shoulder=番茄肩部
    soil furrow=土壤垄沟
    mulch layer=覆盖层
    compost fork=堆肥叉
    wheelbarrow tray=独轮车斗
    hose bib=水管龙头
    drip emitter=滴灌出水器
  `),
  group("hospital", "radiology-suite", "radiology-suite-detail", `
    MRI bore=磁共振孔腔
    magnet housing=磁体外壳
    gradient cabinet=梯度柜
    RF shield=射频屏蔽
    coil cable=线圈电缆
    patient table pad=检查床垫
    table pedestal=床台底座
    table latch=床台卡扣
    gantry handle=机架把手
    gantry foot=机架底脚
    console monitor=控制台显示器
    control panel=控制面板
    image workstation=影像工作站
    keyboard tray=键盘托盘
    mouse pad=鼠标垫
    head cushion=头部垫
    ear protector=耳部护具
    positioning laser=定位激光
    ceiling track=天花导轨
    contrast bottle=造影剂瓶
    injector tubing=注射器管路
    ultrasound screen=超声屏幕
    probe cable=探头电缆
    probe holder=探头支架
    exam couch=检查床
    imaging curtain=影像帘
    lead screen=铅屏风
    radiation badge=辐射剂量牌
    detector cable=探测器电缆
    floor conduit=地面导管
  `),
  group("pathology-lab", "slide-staining", "slide-staining-detail", `
    stain tray divider=染色托盘隔板
    reagent bottle shoulder=试剂瓶肩
    reagent bottle cap=试剂瓶盖
    rinse beaker=冲洗烧杯
    wash bottle nozzle=洗瓶喷嘴
    slide basket=载玻片篮
    slide basket handle=载玻片篮把手
    slide rack post=载玻片架立柱
    slide rack foot=载玻片架底脚
    stain jar handle=染色罐把手
    stain jar base=染色罐底座
    reagent tray lip=试剂托盘边
    pipette plunger=移液器活塞
    pipette shaft=移液器杆
    pipette tip box=移液吸头盒
    centrifuge rotor cap=离心机转子盖
    centrifuge latch=离心机卡扣
    centrifuge display=离心机显示屏
    timer dial=计时器旋钮
    drying rack shelf=晾片架搁板
    slide scanner lid=切片扫描仪盖
    scanner tray=扫描托盘
    cover glass stack=盖玻片叠
    mounting medium bottle=封片剂瓶
    resin bottle=树脂瓶
    stain spill tray=染液溢出盘
    drain grate=排水格栅
    bench backsplash=工作台挡水板
    cabinet handle=柜门把手
    splash guard rail=防溅护栏
  `),
  group("hospital-pharmacy", "dispensing-counter", "dispensing-counter-detail", `
    dispensing chute=配药滑槽
    counting tray divider=计数托盘隔板
    tablet counter window=药片计数窗
    pill funnel=药片漏斗
    capsule funnel=胶囊漏斗
    vial label roll=药瓶标签卷
    label backing=标签底纸
    printer cover=打印机盖
    printer display=打印机显示屏
    receipt cutter=收据切刀
    order screen=订单屏幕
    prescription scanner=处方扫描仪
    basket divider=篮筐隔板
    pickup shelf lip=取药架边
    service bell button=服务铃按钮
    counter backsplash=柜台挡水板
    counter seam=柜台接缝
    drawer face=抽屉面板
    cabinet door=柜门
    bottle tray divider=药瓶托盘隔板
    ampoule divider=安瓿隔板
    syringe cap=注射器帽
    oral syringe barrel=口服注射器筒
    spatula bowl=药匙槽
    mortar handle=研钵把手
    scale platform=秤台
    beaker handle=烧杯把手
    spill mat=防溢垫
    waste bin lid=废物桶盖
    vial sticker=药瓶贴签
  `),
  group("airport", "departure-concourse", "departure-concourse-detail", `
    gate sign frame=登机口标牌框
    boarding podium base=登机台底座
    boarding pass slot=登机牌插槽
    gate scanner lens=登机口扫描镜头
    queue barrier foot=排队隔离柱底座
    queue belt clip=排队带夹
    seat support=座椅支撑
    lounge chair back=候机椅靠背
    seat cushion seam=座垫接缝
    seat frame=座椅框架
    row divider=座椅排隔板
    armrest hinge=扶手铰链
    gate reader=登机口读卡器
    gate barrier foot=登机口隔离柱底座
    window frame joint=窗框接头
    concourse handrail=大厅扶手
    jet bridge joint=登机桥接头
    jet bridge window=登机桥窗
    jet bridge floor mat=登机桥地垫
    bridge door seal=廊桥门密封
    aircraft stair rail=登机梯扶手
    boarding desk drawer=登机台抽屉
    departure board frame=出发牌框
    concourse column base=大厅柱基
    ceiling panel=天花板
    ceiling light=天花灯
    floor tile joint=地砖接缝
    gate counter edge=登机柜台边
    lounge plant pot=候机区花盆
    water fountain spout=饮水机出水嘴
  `),
  group("office-building", "conference-room", "conference-detail", `
    conference table corner=会议桌角
    table leg brace=桌腿撑
    chair backrest=椅背
    chair seat cushion=椅座垫
    chair arm pad=椅扶手垫
    chair caster=椅脚轮
    glass door handle=玻璃门把手
    glass door hinge=玻璃门铰链
    glass seal=玻璃密封条
    glass mullion cap=玻璃竖框帽
    whiteboard surface=白板面
    whiteboard corner=白板角
    marker rack=标记笔架
    marker eraser=白板擦
    presentation remote=演示遥控器
    projector cable=投影仪电缆
    camera power lead=摄像机电源线
    microphone base=麦克风底座
    speaker grille=扬声器格栅
    table power socket=桌面电源插座
    conference badge holder=会议证件夹
    blind cord=百叶绳
    acoustic panel edge=吸音板边
    ceiling speaker=天花扬声器
    room light switch=房间灯开关
    meeting table edge=会议桌边
    chair foot ring=椅脚圈
    screen power cable=屏幕电源线
    conference room clock=会议室时钟
    table cable tray=桌下电缆托盘
  `),
  group("apartment", "verified-living-room", "living-room-detail", `
    sofa leg=沙发腿
    sofa back cushion=沙发靠垫
    cushion seam=靠垫接缝
    sofa throw=沙发毯
    coffee table top=茶几桌面
    tabletop grain=桌面木纹
    vase body=花瓶瓶身
    shelf bracket=搁板支架
    shelf side=搁板侧板
    book spine=书脊
    media drawer=电视柜抽屉
    media cabinet leg=电视柜柜腿
    tv screen=电视屏幕
    media cabinet handle=电视柜把手
    rug fringe=地毯流苏
    rug pile=地毯绒面
    curtain finial=窗帘杆端头
    curtain track=窗帘轨道
    window latch=窗窗闩
    window sill corner=窗台角
    planter weave=花盆编织纹
    plant leaf tip=叶尖
    floor lamp switch=落地灯开关
    lamp shade rim=灯罩边
    chair backrest=椅背
    chair armrest=椅扶手
    chair leg=椅腿
    floorboard grain=地板木纹
    wall trim=墙面线脚
    ceiling seam=天花接缝
  `),
  group("kitchen", "verified-kitchen-island", "preparation-island", `
    island countertop=岛台台面
    cutting board grain=砧板木纹
    cutting board edge=砧板边缘
    bread crust edge=面包皮边
    fruit bowl base=水果碗底
    bowl base=碗底
    measuring cup handle=量杯把手
    mixing bowl rim=搅拌碗边
    rolling pin barrel=擀面杖筒
    knife handle=刀柄
    whisk loop=打蛋器环
    spice jar lid=香料罐盖
    oil bottle neck=油瓶颈
    vinegar bottle neck=醋瓶颈
    dish rack tine=碗碟架齿
    plate rim=盘沿
    sink faucet base=水龙头底座
    sink drain stopper=水槽塞
    island support foot=岛台支脚
    stool foot ring=凳脚圈
    towel corner=毛巾角
    towel stripe=毛巾条纹
    vase base=花瓶底
    herb stem tip=香草茎尖
    pan handle grip=平底锅握柄
    pot lid knob=锅盖旋钮
    oven control dial=烤箱控制旋钮
    hood vent slot=油烟机通风槽
    cabinet knob=橱柜旋钮
    backsplash tile=挡水板瓷砖
  `),
  group("bedroom", "verified-wardrobe", "storage-area", `
    wardrobe door panel=衣柜门板
    wardrobe door edge=衣柜门边
    door handle plate=门把手底板
    hinge leaf=铰链页片
    hinge pin=铰链销
    shelf support=搁板支撑
    shelf divider=搁板隔板
    shelf edge=搁板边缘
    clothes rail end=衣杆端头
    hanger hook=衣架挂钩
    hanger shoulder=衣架肩
    shirt collar=衬衫领
    shirt cuff=衬衫袖口
    garment hem=衣物下摆
    jacket lapel=夹克翻领
    jacket sleeve=夹克袖
    trouser waistband=裤腰
    trouser hem=裤脚
    skirt fold=裙褶
    sweater cuff=毛衣袖口
    belt loop=皮带环
    belt buckle=皮带扣
    shoe lace=鞋带
    shoe sole edge=鞋底边
    shoebox lid=鞋盒盖
    storage basket=收纳篮
    drawer front=抽屉面
    drawer handle=抽屉把手
    wardrobe side panel=衣柜侧板
    wardrobe floor=衣柜底板
  `),
  group("bathroom", "verified-shower", "shower-area", `
    shower arm=淋浴臂
    shower flange=淋浴法兰
    shower grate=淋浴格栅
    shower tile=淋浴瓷砖
    tile seam=瓷砖接缝
    shower glass edge=淋浴玻璃边
    glass clamp=玻璃夹
    door gasket=门密封条
    handle mount=把手底座
    mixer trim=混水器饰圈
    mixer escutcheon=混水器装饰盖
    hand shower holder=手持花洒支架
    hose coupling=软管接头
    niche trim=壁龛饰边
    niche ledge=壁龛台沿
    bench edge=淋浴凳边
    bench support=淋浴凳支撑
    towel bar mount=毛巾杆座
    towel corner=毛巾角
    towel stripe=毛巾条纹
    shelf divider=搁板隔板
    shelf front=搁板前沿
    toilet base=马桶底座
    toilet seat hinge=马桶座铰链
    flush plate edge=冲水板边
    paper holder arm=纸架支臂
    bath rim edge=浴缸边缘
    bath tray slat=浴缸托盘木条
    sink drain cover=洗手盆排水盖
    vanity side panel=浴室柜侧板
  `),
  group("city-cafe", "verified-display-case", "counter-pastries", `
    croissant layer=羊角面包层
    muffin liner=松饼纸托
    tart filling=水果挞馅
    cake crumb=蛋糕屑
    bread slice=面包片
    display case corner=展示柜角
    glass shelf bracket=玻璃搁板支架
    tray handle=托盘把手
    cake stand foot=蛋糕架底脚
    pastry tong handle=糕点夹把手
    dessert fork tine=甜点叉齿
    sugar lid knob=糖罐盖钮
    milk pitcher handle=奶缸把手
    espresso cup rim=浓缩咖啡杯沿
    coffee saucer=咖啡碟
    counter drawer=柜台抽屉
    counter cabinet=柜台柜体
    payment terminal stand=支付终端支架
    receipt paper=收据纸
    menu board frame=菜单板框
    display glass edge=展示玻璃边
    pastry label strip=糕点标签条
    croissant flake=羊角面包酥片
    muffin crumb=松饼屑
    cake frosting=蛋糕糖霜
    tart crust=挞皮
    bread scoring=面包割纹
    cup saucer edge=杯碟边
    grinder dial=研磨机旋钮
    steam valve handle=蒸汽阀把手
  `),
  group("hospital", "operating-theatre", "operating-theatre-detail", `
    surgical light handle=手术灯把手
    lamp yoke=灯具叉架
    lamp reflector=灯具反光罩
    ceiling boom=天花吊臂
    anesthesia cart=麻醉推车
    ventilator bellows=呼吸机风箱
    breathing hose=呼吸管
    airway filter=气道过滤器
    face mask seal=面罩密封边
    endotracheal tube=气管导管
    oxygen hose=氧气管
    medical gas hose=医用气体管
    ECG cable=心电线缆
    pulse oximeter clip=血氧夹
    blood pressure hose=血压管
    suction tip=吸引头
    suction tubing=吸引管
    electrosurgery foot pedal=电外科脚踏板
    cautery return cable=电凝回路线
    instrument bowl=器械碗
    sterile tray=无菌托盘
    scalpel blade=手术刀片
    forceps jaw=镊钳夹齿
    retractor handle=牵开器把手
    needle holder jaw=持针器钳口
    syringe tray=注射器托盘
    suture pack=缝合包
    sharps lid=锐器盒盖
    waste-bin pedal=废物桶踏板
    sterile curtain=无菌帘
  `),
  group("pathology-lab", "cold-storage", "cold-storage-detail", `
    freezer door=冷冻柜门
    temperature display=温度显示屏
    alarm lamp=报警灯
    tray bin=托盘箱
    cryobox=冻存盒
    vial label=小瓶标签
    evaporator panel=蒸发器面板
    handle grip=把手握持部
    latch pin=锁闩销
    drain channel=排水槽
    cold-room light=冷藏室灯
    insulated panel=保温板
    door window=门窗
    freezer shelf=冷冻架
    sample carrier=样本托架
    specimen rack handle=标本架把手
    storage drawer=储存抽屉
    door hinge plate=门铰链板
    alarm test button=报警测试按钮
    condensation bead=冷凝水珠
    freezer drawer front=冷冻抽屉面
    drawer rail=抽屉导轨
    freezer basket=冷冻篮
    cryovial cap=冻存管盖
    cryogenic label=低温标签
    specimen box insert=标本盒内托
    cabinet caster=柜体脚轮
    door frame=门框
    threshold strip=门槛条
    freezer door seal=冷冻柜门封
  `),
  group("hospital-pharmacy", "compounding-bench", "compounding-bench-detail", `
    spatula handle=药匙把手
    calibration weight=校准砝码
    balance draft shield=天平防风罩
    balance leveling foot=天平调平脚
    balance bubble level=天平水平泡
    bench mat=工作台垫
    glass stirring rod=玻璃搅拌棒
    stirring blade=搅拌叶片
    beaker spout=烧杯嘴
    cylinder graduation=量筒刻度
    cylinder base=量筒底座
    bottle label=瓶身标签
    bottle dropper=瓶滴管
    vial stopper=小瓶塞
    vial neck=小瓶颈
    ampoule breaker=安瓿折断器
    ointment spatula=软膏药匙
    ointment tube=软膏管
    cream jar lid=乳膏罐盖
    filter funnel=过滤漏斗
    filter membrane=滤膜
    sieve frame=筛框
    wash bottle nozzle=洗瓶嘴
    solvent bottle=溶剂瓶
    amber vial=棕色小瓶
    safety goggles=护目镜
    nitrile glove=丁腈手套
    bench corner=工作台角
    mixing tray=混合托盘
    pill counter tray=药片计数托盘
  `),
  group("airport", "baggage-claim", "baggage-claim-detail", `
    luggage wheel=行李轮
    handle grip=把手握柄
    zipper pull=拉链头
    tag barcode=标签条码
    luggage shell=行李箱壳
    suitcase corner=行李箱角
    suitcase lining=行李箱内衬
    suitcase strap=行李箱绑带
    spinner caster=万向脚轮
    carousel belt edge=转盘带边
    carousel side panel=转盘侧板
    carousel support leg=转盘支腿
    carousel drive cover=转盘驱动罩
    drive roller=驱动滚筒
    return roller=回程滚筒
    guide rail=导向轨
    belt tensioner=皮带张紧器
    motor housing=电机外壳
    claim number display=提取编号显示屏
    baggage information screen=行李信息屏
    oversize gate=超大行李闸口
    bag inspection tray=行李检查托盘
    customs desk=海关柜台
    claim counter shelf=提取柜台搁板
    queue sign=排队标牌
    stanchion base=隔离柱底座
    barrier strap=隔离带
    floor tile seam=地砖接缝
    tactile strip=触感条
    drain cover=排水盖
  `),
  group("office-building", "break-room", "break-room-detail", `
    backsplash tile=后挡板瓷砖
    upper cabinet door=吊柜门
    cabinet knob=柜门旋钮
    open shelf=开放搁板
    countertop edge=台面边缘
    island leg=中岛支腿
    sink basin=水槽盆
    faucet handle=水龙头把手
    soap pump=洗手液泵
    coffee brewer=咖啡冲煮机
    carafe=咖啡壶
    mug shelf=马克杯搁板
    refrigerator door=冰箱门
    microwave panel=微波炉面板
    microwave keypad=微波炉按键
    kettle spout=水壶壶嘴
    toaster slot=烤面包机槽
    pendant shade=吊灯灯罩
    bar stool seat=吧台凳座面
    table top=桌面
    plant pot=花盆
    cutting board=砧板
    bowl rim=碗沿
    plate stack=盘子摞
    cup rim=杯沿
    undercounter drawer=台下抽屉
    floor tile=地砖
    cabinet side panel=柜体侧板
    drawer face=抽屉面板
    shelf lip=搁板前沿
  `),
  group("greenhouse-interior", "greenhouse-shell", "greenhouse-structure", `
    roof frame=屋顶框架
    sidewall panel=侧墙板
    glazing bar=玻璃压条
    glazing seam=玻璃接缝
    frame post=框架立柱
    door panel=门板
    door latch=门闩
    door sweep=门底扫条
    bench post=种植台立柱
    bench surface=种植台台面
    bench tray=种植托盘
    propagation dome=育苗罩
    propagation lid=育苗盖
    potting cup=育苗杯
    crop row=作物行
    tomato truss=番茄花序
    pepper leaf=辣椒叶
    basil stem=罗勒茎
    marigold petal=万寿菊花瓣
    irrigation hose=灌溉软管
    hose nozzle=软管喷嘴
    drip line=滴灌管线
    floor drain=地面排水口
    floor mat=地垫
    shade cloth=遮阳布
    fan guard=风扇护罩
    circulation fan=循环风扇
    thermometer=温度计
    humidity gauge=湿度表
    gravel joint=砾石接缝
  `),
  group("tomato-plant", "left-foliage", "leaf-anatomy", `
    leaf rachilla=小叶轴
    leaflet serration=小叶锯齿
    leaf margin tooth=叶缘齿
    leaf vein branch=叶脉分支
    leaf tip hair=叶尖毛
    petiole base=叶柄基部
    petiole groove=叶柄沟
    leaf curl=叶片卷曲
    veinlet=细脉
    leaflet pair=小叶对
    leaflet stalk=小叶柄
    leaflet joint=小叶连接处
    leaflet lobe edge=小叶裂片边
    leaflet veinlet=小叶细脉
    leaflet hair=小叶毛
    leaf fold=叶片折痕
    leaf crease=叶片褶皱
    leaf shadow=叶片阴影
    leaf cluster=叶簇
    leaf segment=叶片段
    leaf branch=叶片分支
    leaf surface sheen=叶面光泽
    leaf edge=叶片边缘
    leaf tip notch=叶尖缺口
    leaf spot edge=叶斑边缘
    leaf vein junction=叶脉交汇
    leaf underside=叶片背面
    leaf base crease=叶基褶痕
    leaflet midrib=小叶中脉
    leaflet tip notch=小叶尖缺口
  `),
  group("potting-workbench", "hand-tool-row", "hand-tool-zone", `
    trowel blade=小铲刃
    trowel ferrule=小铲箍
    hand fork handle=手叉把手
    rake head=耙头
    rake handle=耙柄
    pruner spring=修枝剪弹簧
    pruner blade=修枝剪刃
    shear pivot=剪刀转轴
    shear handle=剪刀把手
    brush bristle=刷毛
    brush handle=刷柄
    dibber tip=移苗锥尖
    dibber shaft=移苗锥杆
    mister body=喷雾壶壶身
    mister cap=喷雾壶盖
    spray trigger=喷壶扳机
    watering handle=浇水壶把手
    can lid=浇水壶盖
    hose coupling=软管接头
    tool hook mount=工具挂钩座
    rail bracket=工具轨支架
    rail cap=工具轨端盖
    handle loop=把手环
    glove palm=手套掌面
    glove finger=手套指部
    apron tie=围裙系带
    bench crossbar=工作台横梁
    bench brace=工作台撑杆
    bench peg=工作台插销
    shelf bracket=搁板支架
  `),
  group("community-garden", "raised-beds", "raised-bed-zone", `
    bed soil surface=种植床土面
    bed timber end=种植床木端
    bed corner joint=种植床角接头
    bed liner=种植床衬层
    bed mulch=种植床覆盖物
    row marker=种植行标记
    seedling row=幼苗行
    kale stalk=羽衣甘蓝茎
    lettuce head=生菜球
    lettuce leaf=生菜叶
    bean flower=豆花
    bean stem=豆茎
    carrot shoulder=胡萝卜肩
    carrot root=胡萝卜根
    trellis foot=棚架脚
    trellis clip=棚架夹
    trellis post cap=棚架柱帽
    tomato leaf=番茄叶
    tomato stem=番茄茎
    soil clod=土块
    mulch chip=覆盖木屑
    bed path=种植床小径
    irrigation line=灌溉管线
    drip connector=滴灌接头
    crop stake=作物支杆
    crop row=作物行
    leaf cluster=叶簇
    bed support=种植床支撑
    timber screw=木梁螺钉
    bed side rail=种植床侧轨
  `),
  group("leaf", "main-oak-leaf", "leaf-form-and-surface", `
    leaf outline=叶片轮廓
    leaf apex=叶尖
    leaf lobe edge=叶裂片边
    lobe tip=裂片尖
    midvein=中脉
    veinlet branch=细脉分支
    veinlet tip=细脉尖
    leaf scar=叶痕
    leaf vein junction=叶脉交汇
    leaf surface sheen=叶面光泽
    petiole groove=叶柄沟
    vein network branch=叶脉网分支
    leaf margin notch=叶缘缺口
    dew bead edge=露珠边
    water bead cluster=水珠簇
    leaf blemish=叶面斑痕
    leaf fold=叶片折痕
    leaf notch=叶片缺口
    leaf ridge=叶片脊
    leaf texture=叶面纹理
    leaf vein fork=叶脉分叉
    leaf surface patch=叶面斑块
    leaf edge crease=叶缘褶痕
    leaf tip edge=叶尖边缘
    leaf base fold=叶基折痕
    leaf midrib groove=叶中脉沟
    leaf vein ridge=叶脉凸起
    leaf dew line=叶面露线
    leaf sheen patch=叶面光泽斑
    leaf water film=叶面水膜
  `),
  group("transit-hub", "verified-concourse", "central-concourse", `
    ceiling beam joint=天花梁接缝
    skylight mullion=天窗竖框
    roof gasket=屋顶密封条
    escalator balustrade=扶梯侧板
    escalator comb plate=扶梯梳齿板
    escalator skirt=扶梯裙板
    handrail return=扶手回转端
    stair nosing=楼梯踏步前缘
    stair riser=楼梯立板
    stair stringer=楼梯梯梁
    fare gate pedestal=闸机底座
    fare gate sensor=闸机传感器
    ticket machine bezel=售票机边框
    ticket machine slot=售票机插槽
    elevator call button=电梯呼叫按钮
    elevator door seam=电梯门缝
    elevator threshold=电梯门槛
    clock mount=时钟支座
    display housing=显示屏外壳
    route map frame=线路图边框
    information kiosk shelf=信息亭搁板
    kiosk bezel=信息亭边框
    bench slat=长椅木条
    planter box=种植箱
    plant stem=植物茎
    floor tile seam=地砖接缝
    expansion joint cover=伸缩缝盖板
    polished floor reflection=抛光地面倒影
    security dome=安防球罩
    extinguisher bracket=灭火器支架
  `),
  group("leaf", "vein-network", "veins-water-and-lens", `
    vein branch=叶脉分支
    vein junction=叶脉交汇
    veinlet chain=细脉链
    veinlet fork=细脉分叉
    vein ridge=叶脉凸脊
    vein groove=叶脉沟
    midrib edge=中脉边
    petiole base=叶柄基部
    petiole scar=叶柄痕
    leaf surface grain=叶面纹理
    cuticle sheen=角质层光泽
    dew droplet=露珠
    droplet rim=水滴边缘
    water film edge=水膜边缘
    water bead ridge=水珠脊
    leaf highlight=叶面高光
    leaf shadow=叶片阴影
    leaf blotch=叶面斑块
    leaf puncture=叶面孔点
    chew notch=啃食缺口
    web anchor=蛛网锚点
    web cross thread=蛛网交叉丝
    silk strand=蛛丝
    spider silk knot=蛛丝结
    ladybird leg=瓢虫足
    aphid body=蚜虫身体
    caterpillar segment edge=毛虫节段边
    acorn cap scale=橡果帽鳞片
    bud scale fold=芽鳞折痕
    twig node scar=枝节痕
  `),
];

const realmByScene = {
  hospital: "body-daily-life",
  "pathology-lab": "body-daily-life",
  "hospital-pharmacy": "body-daily-life",
  airport: "objects-technology",
  "office-building": "people-society",
  "city-street": "objects-technology",
  "transit-hub": "objects-technology",
  "science-museum": "objects-technology",
  "city-park": "nature-life",
  "community-garden": "nature-life",
  "greenhouse-interior": "nature-life",
  "tomato-plant": "nature-life",
  "potting-workbench": "nature-life",
  leaf: "nature-life",
  "electric-bus": "objects-technology",
  battery: "objects-technology",
  "railway-platform": "objects-technology",
  "train-carriage": "objects-technology",
  "rail-bogie": "objects-technology",
  "blood-cell": "body-daily-life",
  heart: "body-daily-life",
  "human-body": "body-daily-life",
  hemoglobin: "body-daily-life",
  "oxygen-molecule": "body-daily-life",
};

function slugify(word) {
  return word
    .toLocaleLowerCase()
    .replace(/[^a-z]+/g, "-")
    .replace(/^-|-$/g, "");
}

function addGroup(scene, definition, groupIndex) {
  const region = scene.visualRegions.find(({ id }) => id === definition.regionId);
  if (!region) throw new Error(`${scene.id} has no region ${definition.regionId}`);
  const zone = (scene.detailZones ?? []).find(({ id }) => id === definition.zoneId);
  if (!zone) throw new Error(`${scene.id} has no detail zone ${definition.zoneId}`);
  const placementRect = {
    x: Math.max(region.x, zone.x),
    y: Math.max(region.y, zone.y),
    width: Math.min(region.x + region.width, zone.x + zone.width)
      - Math.max(region.x, zone.x),
    height: Math.min(region.y + region.height, zone.y + zone.height)
      - Math.max(region.y, zone.y),
  };
  if (placementRect.width <= 0 || placementRect.height <= 0) {
    throw new Error(`${scene.id}/${definition.regionId} and ${definition.zoneId} do not overlap`);
  }

  const existingWords = new Set(scene.labels.map(({ word }) => word.toLocaleLowerCase()));
  const existingIds = new Set(scene.labels.map(({ id }) => id));
  const presentCount = definition.terms.filter(({ word }) => (
    existingWords.has(word.toLocaleLowerCase())
  )).length;
  if (presentCount === definition.terms.length) return 0;
  if (presentCount > 0) {
    const presentTerms = definition.terms
      .filter(({ word }) => existingWords.has(word.toLocaleLowerCase()))
      .map(({ word }) => word)
      .join(", ");
    throw new Error(`${scene.id}/${definition.regionId} is only partially applied: ${presentTerms}`);
  }
  const maxPriority = scene.labels.reduce((max, label) => Math.max(max, label.priority ?? 0), 0);
  const added = definition.terms.map((term, index) => {
    const normalized = term.word.toLocaleLowerCase();
    if (existingWords.has(normalized)) {
      throw new Error(`${scene.id} already contains ${term.word}`);
    }
    const baseId = slugify(term.word);
    const id = `${baseId}-pro-${groupIndex + 1}`;
    if (existingIds.has(id)) throw new Error(`${scene.id} already contains id ${id}`);
    const column = index % 6;
    const row = Math.floor(index / 6);
    const x = placementRect.x + ((column + 0.5) / 6) * placementRect.width;
    const y = placementRect.y + ((row + 0.5) / 5) * placementRect.height;
    const label = {
      id,
      word: term.word,
      translation: term.translation,
      x: Number(x.toFixed(2)),
      y: Number(y.toFixed(2)),
      priority: Number((maxPriority + (index + 1) / 1000).toFixed(6)),
      // Professional/detail additions are intentionally revealed after the
      // existing overview vocabulary. The words stay fully authored and
      // reachable at deeper zoom, while a scene does not mount hundreds of
      // new pills on its first frame.
      minLevel: 2 + Math.floor(index / 10),
      sourceVisualRegion: definition.regionId,
      semanticRealmId: realmByScene[scene.id],
    };
    existingWords.add(normalized);
    existingIds.add(id);
    zone.labelIds.push(id);
    return label;
  });
  scene.labels.push(...added);
  return added.length;
}

/** Rebalance older generated batches to the same detail-first LOD contract. */
function rebalanceProfessionalLod(scene) {
  const grouped = new Map();
  for (const label of scene.labels) {
    const match = /-pro-(\d+)$/u.exec(label.id);
    if (!match) continue;
    const groupIndex = Number(match[1]);
    const group = grouped.get(groupIndex) ?? [];
    group.push(label);
    grouped.set(groupIndex, group);
  }
  let changed = 0;
  for (const labels of grouped.values()) {
    labels.sort((first, second) => (
      (first.priority ?? 0) - (second.priority ?? 0)
      || first.id.localeCompare(second.id)
    ));
    labels.forEach((label, index) => {
      const minLevel = 2 + Math.floor(index / 10);
      if (label.minLevel !== minLevel) {
        label.minLevel = minLevel;
        changed += 1;
      }
    });
  }
  return changed;
}

async function main() {
  const byScene = new Map();
  for (const definition of groups) {
    const scene = byScene.get(definition.sceneId) ?? JSON.parse(
      await readFile(resolve(dataRoot, `${definition.sceneId}.json`), "utf8"),
    );
    byScene.set(definition.sceneId, scene);
  }

  const additions = new Map();
  const groupIndexByScene = new Map();
  for (const definition of groups) {
    const scene = byScene.get(definition.sceneId);
    const oldLength = scene.labels.length;
    const groupIndex = groupIndexByScene.get(definition.sceneId) ?? 0;
    const added = addGroup(scene, definition, groupIndex);
    groupIndexByScene.set(definition.sceneId, groupIndex + 1);
    additions.set(definition.sceneId, (additions.get(definition.sceneId) ?? 0) + added);
    if (scene.labels.length !== oldLength + added) {
      throw new Error(`Unexpected label count while adding ${definition.sceneId}`);
    }
  }

  for (const [sceneId, scene] of byScene) {
    const added = additions.get(sceneId) ?? 0;
    const rebalanced = rebalanceProfessionalLod(scene);
    if (added === 0 && rebalanced === 0) continue;
    const audit = scene.anchorAudit;
    if (added > 0) {
      audit.previousLabelCount += added;
      audit.retainedLabelCount = scene.labels.length;
      audit.rationale = `${audit.rationale.trim()} The professional vocabulary pass adds ${added} additional region-grounded nouns across the reviewed facilities, equipment, diagnostic, disease, medicine or building-system crops.`;
    }
    await writeFile(
      resolve(dataRoot, `${sceneId}.json`),
      `${JSON.stringify(scene, null, 2)}\n`,
      "utf8",
    );
    console.log(`${sceneId}: +${added} labels, rebalanced ${rebalanced} LODs (${scene.labels.length} total)`);
  }
}

await main();

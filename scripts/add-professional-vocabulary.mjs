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
      minLevel: Math.floor(index / 6),
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
    if (added === 0) continue;
    const audit = scene.anchorAudit;
    audit.previousLabelCount += added;
    audit.retainedLabelCount = scene.labels.length;
    audit.rationale = `${audit.rationale.trim()} The professional vocabulary pass adds ${added} additional region-grounded nouns across the reviewed facilities, equipment, diagnostic, disease, medicine or building-system crops.`;
    await writeFile(
      resolve(dataRoot, `${sceneId}.json`),
      `${JSON.stringify(scene, null, 2)}\n`,
      "utf8",
    );
    console.log(`${sceneId}: +${added} labels (${scene.labels.length} total)`);
  }
}

await main();

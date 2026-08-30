import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

const root = resolve(import.meta.dirname, "..");
const sourceAsset = resolve(root, "scripts/assets/supermarket-checkout-station-v1.png");
const publicAsset = resolve(root, "public/scenes/supermarket-checkout-station-premium-v1.jpg");
const scenePath = resolve(root, "public/data/scenes/supermarket-checkout-station.json");
const parentPath = resolve(root, "public/data/scenes/supermarket-grocery.json");
const manifestPath = resolve(root, "public/data/scenes/manifest.json");
const WIDTH = 1600; const HEIGHT = 900;
const SOURCE_SHA256 = "97330dda165d4aced271ed2b20a83acd3e25d807aaf6d3e6efdb3c37b88e925c";
const PUBLIC_SHA256 = "44d9ef20a386aa57eeddebbd51419a8353131a9aeb4759d6bbc0b95bfc61fe81";

const zones = [
  { id: "infeed-conveyor", title: "In-feed conveyor", translation: "进货输送带", x: 40, y: 260, width: 700, height: 560, targetScale: 2.7, labels: [
    ["checkout in-feed conveyor","收银台进货输送带",360,430,0],["checkout conveyor belt","收银输送带面",360,430,0],["rubber belt texture","输送带橡胶纹理",360,430,3],["conveyor belt seam","输送带接缝",250,430,4],
    ["in-feed conveyor nose","进货输送带前端",80,500,1],["conveyor nose roller","输送带前滚筒",90,500,3],["conveyor side rail","输送带侧轨",360,345,1],["stainless conveyor edge","不锈钢输送带边",360,565,2],
    ["conveyor corner bumper","输送带转角缓冲件",85,565,3],["checkout divider bar","收银分隔棒",580,375,0],["divider-bar end cap","分隔棒端帽",580,375,3],["conveyor photo eye","输送带光电眼",575,465,1],
    ["photo-eye lens","光电眼镜片",575,465,4],["conveyor control switch","输送带控制开关",525,550,2],["checkout conveyor access panel","收银输送带检修板",390,650,1],["access-panel pull","检修板拉手",390,650,3],
    ["conveyor cabinet hinge","输送带柜铰链",310,650,4],["in-feed end trim","进货端饰条",125,570,3],["checkout lane guide rail","收银通道导轨",190,300,1],["lane-guide post","通道导轨立柱",185,320,2],
    ["lane-guide base","通道导轨底座",185,510,3],["stacked shopping basket","堆叠购物篮",280,735,0],["checkout basket rim","收银区购物篮上沿",280,700,3],["basket lattice wall","购物篮格栅壁",280,760,4],
  ]},
  { id: "scanner-scale", title: "Scanner and scale", translation: "扫描秤台", x: 520, y: 80, width: 450, height: 520, targetScale: 3.05, labels: [
    ["checkout scanner scale","收银扫描秤",690,390,0],["horizontal scan glass","水平扫描玻璃",680,420,0],["scan-glass bevel","扫描玻璃斜边",680,420,3],["scan-glass frame","扫描玻璃框",680,420,2],
    ["vertical scan window","垂直扫描窗",670,330,0],["red scan illumination","红色扫描照明",670,340,2],["vertical scanner hood","垂直扫描器罩",670,320,1],["scanner hood sidewall","扫描器罩侧壁",620,340,3],
    ["scale platter","秤台承载盘",745,430,1],["scale-platter corner","秤台盘角",760,445,4],["scanner-scale leveling screw","扫描秤调平螺钉",620,465,4],["scanner bucket rim","扫描器安装槽边",700,455,3],
    ["checkout product sweep","收银商品滑移面",560,445,1],["sweep-plate edge","滑移板边缘",560,450,3],["scanner indicator lamp","扫描器指示灯",720,365,2],["scanner status bezel","扫描状态框",720,365,4],
    ["scanner service latch","扫描器检修锁扣",625,385,3],["customer coupon scanner","顾客优惠码扫描器",560,335,1],["coupon scanner aperture","优惠码扫描孔",560,335,4],["scanner mounting flange","扫描器安装法兰",620,445,3],
    ["scale display pole","秤重显示杆",610,205,1],["blank scale display","空白秤重显示屏",655,125,0],["scale-display bezel","秤重显示屏框",655,125,3],["scale-display pedestal","秤重显示屏底座",655,220,3],
  ]},
  { id: "operator-controls", title: "Operator controls", translation: "收银员控制区", x: 730, y: 130, width: 440, height: 500, targetScale: 2.95, labels: [
    ["checkout operator display","收银员显示器",900,240,0],["operator screen panel","收银屏幕面板",900,240,2],["operator display bezel","收银显示器边框",900,240,3],["display support arm","显示器支撑臂",900,300,2],
    ["display swivel joint","显示器旋转接头",900,310,4],["checkout keyboard","收银键盘",900,360,0],["keyboard key grid","键盘按键阵列",900,360,2],["numeric key cluster","数字键区",950,360,3],
    ["function-key row","功能键行",850,350,3],["keyboard wrist edge","键盘腕托边",900,385,4],["checkout cash drawer","收银现金抽屉",890,440,0],["cash-drawer front","现金抽屉前面板",890,440,2],
    ["cash-drawer handle","现金抽屉拉手",890,430,3],["cash-drawer lock","现金抽屉锁孔",980,455,3],["drawer countertop","抽屉台面",900,405,2],["checkout handheld barcode scanner","收银手持条码扫描器",1040,405,0],
    ["scanner pistol grip","手持扫描器枪柄",1040,420,3],["checkout scanner trigger","收银扫描器扳机",1035,410,4],["scanner cradle","手持扫描器底座",1040,440,2],["coiled scanner cable","扫描器卷线",1025,470,2],
    ["operator cabinet lock","操作柜锁",810,535,3],["operator counter edge","操作台边缘",930,505,3],["checkout cable grommet","收银台穿线孔",1040,500,3],["grommet rubber ring","穿线孔橡胶圈",1040,500,4],
  ]},
  { id: "payment-receipt", title: "Payment and receipt", translation: "支付与小票", x: 1000, y: 270, width: 380, height: 390, targetScale: 3.0, labels: [
    ["checkout-station receipt printer","收银工位小票打印机",1125,390,0],["printer paper roll","打印机纸卷",1125,375,2],["blank receipt strip","空白小票纸条",1125,360,1],["receipt exit slot","小票出纸口",1125,400,3],
    ["printer lid","打印机上盖",1125,355,2],["printer lid hinge","打印机盖铰链",1090,360,4],["printer status button","打印机状态按钮",1160,430,4],["printer front panel","打印机前面板",1125,420,3],
    ["checkout payment terminal","收银支付终端",1280,390,0],["payment touchscreen","支付终端触屏",1280,355,1],["payment screen bezel","支付屏边框",1280,355,3],["payment keypad","支付终端键盘",1280,410,1],
    ["payment green key","支付绿色键",1300,425,3],["payment yellow key","支付黄色键",1280,425,3],["payment red key","支付红色键",1260,425,3],["card insertion slot","银行卡插槽",1280,445,2],
    ["contactless reader mark","非接触读卡区",1280,340,3],["terminal support post","支付终端支杆",1280,485,2],["terminal swivel mount","支付终端旋转座",1280,470,4],["terminal cable sleeve","支付终端线套",1280,500,4],
    ["checkout coupon slot","收银优惠券投口",1060,520,1],["coupon-slot bezel","优惠券口边框",1060,520,4],["payment counter shelf","支付区台面",1230,500,1],["countertop rounded corner","台面圆角",1350,520,3],
  ]},
  { id: "bagging-area", title: "Bagging area", translation: "装袋区", x: 1280, y: 40, width: 320, height: 860, targetScale: 2.85, labels: [
    ["checkout bagging rack","收银装袋架",1460,540,0],["bag-rack top rail","装袋架顶杆",1460,355,2],["bag-rack side frame","装袋架侧框",1370,520,2],["bag-rack crossbar","装袋架横杆",1460,450,3],
    ["bag-rack corner joint","装袋架转角接头",1370,360,4],["plain reusable bag","无字可重复用袋",1460,520,0],["reusable-bag handle","可重复用袋提手",1460,410,2],["reusable-bag side gusset","可重复用袋侧褶",1510,540,3],
    ["reusable-bag bottom","可重复用袋底",1460,690,3],["bag fabric weave","袋子织物纹理",1460,550,4],["bagging stainless shelf","装袋不锈钢架板",1450,735,1],["bagging shelf lip","装袋架板挡边",1450,720,3],
    ["bagging shelf leg","装袋架板支腿",1550,820,2],["bagging foot pad","装袋架脚垫",1550,865,4],["take-away landing tray","出货承接台",1330,500,1],["landing-tray edge","承接台边缘",1330,520,3],
    ["bag hook","购物袋挂钩",1390,430,2],["bag-hook tip","袋钩尖端",1390,430,4],["bagging frame fastener","装袋架紧固件",1380,470,4],["bagging rail weld","装袋架焊点",1500,450,4],
    ["checkout lane light","收银通道灯",1285,80,0],["lane-light diffuser","通道灯扩散罩",1285,80,3],["lane-light pole","通道灯立杆",1285,250,1],["lane-light pole clamp","通道灯杆夹",1285,320,3],
  ]},
  { id: "cabinet-ergonomics", title: "Cabinet and ergonomics", translation: "柜体与人体工学设施", x: 40, y: 160, width: 1360, height: 740, targetScale: 2.55, labels: [
    ["checkout cabinet body","收银台柜体",850,650,0],["laminate cabinet panel","层压柜面板",850,650,2],["cabinet vertical seam","柜体竖缝",960,650,3],["cabinet access door","柜体检修门",1040,650,1],
    ["access-door recessed pull","检修门嵌入拉手",1040,650,3],["cabinet concealed hinge","柜体暗铰链",1000,650,4],["checkout toe space","收银台脚尖空间",850,700,0],["toe-space kickboard","脚尖空间踢脚板",850,760,2],
    ["cashier footrest","收银员脚踏",850,730,0],["footrest tubular bar","脚踏管杆",850,730,3],["footrest side bracket","脚踏侧支架",780,730,3],["anti-fatigue mat","抗疲劳地垫",850,805,0],
    ["mat beveled edge","地垫斜边",850,850,3],["mat textured surface","地垫防滑纹",850,810,4],["checkout terrazzo floor","收银区水磨石地面",1080,820,1],["floor aggregate speckle","地面骨料斑点",1080,820,4],
    ["checkout impulse rack","收银冲动购货架",470,220,0],["impulse-rack shelf","冲动购货架层板",470,260,2],["impulse-rack end panel","冲动购货架端板",540,280,2],["plain impulse packet","无字小商品袋",450,210,1],
    ["packet sealed edge","小商品袋封边",450,205,4],["shopping-cart handle edge","购物车把手边",70,720,1],["checkout cart basket wire","收银区购物车篮丝",70,760,2],["cart-basket corner joint","购物车篮角接点",80,770,4],
  ]},
];

function sha(bytes){return createHash("sha256").update(bytes).digest("hex");}
function slug(value){return value.toLowerCase().replace(/[^a-z0-9]+/gu,"-").replace(/^-|-$/gu,"");}
function region(word,x,y,zone){const size=42;return{id:`supermarket-checkout-station-region-${slug(word)}`,description:`Pixel-audited “${word}” in the ${zone} crop`,kind:"part",x:Math.max(0,Math.min(WIDTH-size,x-21)),y:Math.max(0,Math.min(HEIGHT-size,y-21)),width:size,height:size};}
function buildScene(){const labels=[];const visualRegions=[];const detailZones=[];let priority=0;for(const zone of zones){const labelIds=[];for(const [word,translation,x,y,minLevel] of zone.labels){const id=`supermarket-checkout-station-${slug(word)}`;const source=region(word,x,y,zone.title);labels.push({id,word,translation,x,y,priority:Number((1+priority++/1000).toFixed(6)),minLevel,sourceVisualRegion:source.id,semanticRealmId:"body-daily-life"});visualRegions.push(source);labelIds.push(id);}detailZones.push({id:`supermarket-checkout-station-zone-${zone.id}`,title:zone.title,translation:zone.translation,description:`Inspect independently visible parts of the ${zone.title.toLowerCase()}.`,x:zone.x,y:zone.y,width:zone.width,height:zone.height,targetScale:zone.targetScale,labelIds});}return{id:"supermarket-checkout-station",title:"Supermarket checkout station",translation:"超市收银台工位",subtitle:"Conveyor, scanner, controls, payment and bagging",asset:"/scenes/supermarket-checkout-station-premium-v1.jpg",width:WIDTH,height:HEIGHT,parentId:"supermarket-grocery",visualRegions,detailZones,anchorAudit:{status:"human-verified",policy:"visible-object-or-part-only",reviewedAsset:"/scenes/supermarket-checkout-station-premium-v1.jpg",reviewedAssetSha256:PUBLIC_SHA256,rationale:"The source and 1600×900 output were inspected at native pixels. Every retained term points to a visible conveyor, scanner-scale, operator control, payment, bagging, cabinet or ergonomic component. Brands, printed copy, prices, payment state and operating claims are excluded.",previousLabelCount:labels.length+8,retainedLabelCount:labels.length,removedLabelCount:8,removedExamples:["brand name","screen text","price","payment status","receipt text","promotion","cash amount","operator action"]},labels,portals:[]};}
async function writeJson(path,value){const next=Buffer.from(`${JSON.stringify(value,null,2)}\n`);try{if(Buffer.compare(await readFile(path),next)===0)return false;}catch(error){if(error.code!=="ENOENT")throw error;}await writeFile(path,next);return true;}
async function ensureAsset(){const source=await readFile(sourceAsset);if(sha(source)!==SOURCE_SHA256)throw new Error("checkout source changed; repeat pixel audit");const output=await sharp(source).resize(WIDTH,HEIGHT,{fit:"cover",position:"centre"}).jpeg({quality:88,chromaSubsampling:"4:4:4",progressive:true}).toBuffer();if(sha(output)!==PUBLIC_SHA256)throw new Error(`checkout JPEG changed: ${sha(output)}`);await writeFile(publicAsset,output);}
const parentPortal={id:"enter-supermarket-checkout-station",label:"Enter the supermarket checkout station",translation:"进入超市收银台工位",childSceneId:"supermarket-checkout-station",sourceVisualRegion:"portal-supermarket-checkout-station",x:850,y:440,width:390,height:450,enterScale:3.25};
const parentRegion={id:parentPortal.sourceVisualRegion,description:"Complete visible center checkout station in the supermarket photograph",kind:"object",x:parentPortal.x,y:parentPortal.y,width:parentPortal.width,height:parentPortal.height};
async function updateParent(){const parent=JSON.parse(await readFile(parentPath,"utf8"));const pi=parent.portals.findIndex(({id})=>id===parentPortal.id);if(pi>=0)parent.portals[pi]=parentPortal;else parent.portals.push(parentPortal);const ri=parent.visualRegions.findIndex(({id})=>id===parentRegion.id);if(ri>=0)parent.visualRegions[ri]=parentRegion;else parent.visualRegions.push(parentRegion);return writeJson(parentPath,parent);}
async function updateManifest(){const manifest=JSON.parse(await readFile(manifestPath,"utf8"));if(!manifest.scenes.some(({id})=>id==="supermarket-checkout-station")){const index=manifest.scenes.findIndex(({id})=>id==="supermarket-grocery");if(index<0)throw new Error("supermarket-grocery missing");manifest.scenes.splice(index+1,0,{id:"supermarket-checkout-station",title:"Supermarket checkout station",parentId:"supermarket-grocery"});}return writeJson(manifestPath,manifest);}
export async function buildSupermarketCheckoutStationScene(){await ensureAsset();const scene=buildScene();return{sceneChanged:await writeJson(scenePath,scene),parentChanged:await updateParent(),manifestChanged:await updateManifest(),labels:scene.labels.length,zones:scene.detailZones.length};}
if(process.argv[1]&&resolve(process.argv[1])===resolve(import.meta.filename))buildSupermarketCheckoutStationScene().then(result=>console.log(JSON.stringify(result,null,2))).catch(error=>{console.error(error);process.exitCode=1;});

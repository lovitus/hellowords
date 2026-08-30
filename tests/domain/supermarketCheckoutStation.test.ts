import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import sharpModule from "sharp";

const root=resolve(import.meta.dirname,"../..");const sceneRoot=resolve(root,"public/data/scenes");
const readJson=async<T>(name:string):Promise<T>=>JSON.parse(await readFile(resolve(sceneRoot,name),"utf8")) as T;
const sharp=sharpModule as unknown as(input:Buffer)=>{metadata():Promise<{format?:string;width?:number;height?:number}>};

interface Region{id:string;x:number;y:number;width:number;height:number}
interface CheckoutScene{id:string;parentId:string;asset:string;width:number;height:number;labels:{id:string;word:string;x:number;y:number;sourceVisualRegion:string}[];visualRegions:Region[];detailZones:{id:string;labelIds:string[]}[];portals:unknown[];anchorAudit:{status:string;retainedLabelCount:number;reviewedAssetSha256:string}}
interface ParentScene{portals:{childSceneId:string;sourceVisualRegion:string;x:number;y:number;width:number;height:number}[];visualRegions:Region[]}

test("the supermarket checkout station grounds 144 distinct visible workstation terms",async()=>{
  const scene=await readJson<CheckoutScene>("supermarket-checkout-station.json");
  assert.deepEqual([scene.id,scene.parentId,scene.asset],["supermarket-checkout-station","supermarket-grocery","/scenes/supermarket-checkout-station-premium-v1.jpg"]);
  assert.deepEqual([scene.width,scene.height],[1600,900]);assert.equal(scene.labels.length,144);assert.equal(new Set(scene.labels.map(({word})=>word)).size,144);
  assert.deepEqual(scene.detailZones.map(({id,labelIds})=>[id,labelIds.length]),[
    ["supermarket-checkout-station-zone-infeed-conveyor",24],["supermarket-checkout-station-zone-scanner-scale",24],["supermarket-checkout-station-zone-operator-controls",24],
    ["supermarket-checkout-station-zone-payment-receipt",24],["supermarket-checkout-station-zone-bagging-area",24],["supermarket-checkout-station-zone-cabinet-ergonomics",24],
  ]);
  assert.deepEqual(scene.portals,[]);assert.equal(scene.anchorAudit.status,"human-verified");assert.equal(scene.anchorAudit.retainedLabelCount,144);
  const regions=new Map(scene.visualRegions.map(region=>[region.id,region]));
  for(const label of scene.labels){const region=regions.get(label.sourceVisualRegion);assert.ok(region,`${label.word} region`);assert.ok(label.x>=region.x&&label.x<=region.x+region.width);assert.ok(label.y>=region.y&&label.y<=region.y+region.height);}
  const bytes=await readFile(resolve(root,`public${scene.asset}`));assert.equal(createHash("sha256").update(bytes).digest("hex"),scene.anchorAudit.reviewedAssetSha256);
  const metadata=await sharp(bytes).metadata();assert.deepEqual({format:metadata.format,width:metadata.width,height:metadata.height},{format:"jpeg",width:1600,height:900});
  const source=await readFile(resolve(root,"scripts/assets/supermarket-checkout-station-v1.png"));assert.equal(createHash("sha256").update(source).digest("hex"),"97330dda165d4aced271ed2b20a83acd3e25d807aaf6d3e6efdb3c37b88e925c");
});

test("the center supermarket checkout is the only entrance to the checkout station",async()=>{
  const parent=await readJson<ParentScene>("supermarket-grocery.json");const portals=parent.portals.filter(({childSceneId})=>childSceneId==="supermarket-checkout-station");assert.equal(portals.length,1);
  const portal=portals[0];const region=parent.visualRegions.find(({id})=>id===portal.sourceVisualRegion);assert.ok(region);assert.ok(portal.x>=region.x&&portal.y>=region.y);assert.ok(portal.x+portal.width<=region.x+region.width);assert.ok(portal.y+portal.height<=region.y+region.height);
});

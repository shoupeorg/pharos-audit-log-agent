import test from "node:test";
import assert from "node:assert/strict";
import { parseRange, firstBlockAtOrAfter } from "../src/dates.js";
import { fetchHistorySource } from "../src/indexer.js";
import { enrichBatch } from "../src/enrich.js";
import { buildReport } from "../src/engine.js";
import { formatUnits } from "../src/exact.js";
import { reportCsv, reportMarkdown } from "../src/exports.js";
import { getReport, saveReport } from "../src/store.js";
import { SWAP_TOPIC } from "../src/constants.js";

const wallet="0x1111111111111111111111111111111111111111", other="0x2222222222222222222222222222222222222222", router="0x3333333333333333333333333333333333333333", tokenA="0x4444444444444444444444444444444444444444", tokenB="0x5555555555555555555555555555555555555555";
const h=n=>`0x${String(n).padStart(64,"0")}`;

test("inclusive/exclusive dates and inclusive end-date conversion are exact",()=>{const r=parseRange("2026-10-10","2026-10-12",true);assert.equal(r.startUtc,"2026-10-10T00:00:00.000Z");assert.equal(r.endUtc,"2026-10-13T00:00:00.000Z");assert.equal(r.semantics,"[start inclusive, end exclusive)")});
test("bounded block search returns first timestamp at or after boundary",async()=>{const times=[100,110,120,130];const call=async(_,args)=>({timestamp:`0x${times[Number(args.block)].toString(16)}`});assert.deepEqual(await firstBlockAtOrAfter(call,115000,3),{block:2,timestamp:"1970-01-01T00:02:00.000Z"})});
test("history pagination retrieves all pages and honors time boundaries",async()=>{const pages={first:{items:[{ts:30},{ts:20}],cursor:"next"},next:{items:[{ts:10},{ts:9}],cursor:null}};const fetchImpl=async url=>{const p=url.includes("cursor")?pages.next:pages.first;return{ok:true,status:200,json:async()=>p.items,headers:{get:()=>p.cursor}}};const result=await fetchHistorySource(wallet,"transactions",10,30,{fetchImpl,maxPages:3});assert.deepEqual(result.observations.map(x=>x.ts),[20,10]);assert.equal(result.pages,2)});
test("interrupted enrichment resumes without duplicate hashes",async()=>{const calls=[];const call=async(name,args)=>{calls.push(`${name}:${args.hash||args.address}`);if(name==="get_transaction")return{from:wallet,to:router,blockNumber:"0x1"};if(name==="get_transaction_receipt")return{status:"0x1",gasUsed:"0x1",effectiveGasPrice:"0x1",logs:[]};return{code:"0x12"}};let state={hashes:[h(1),h(2)],enriched:{},codes:{},enrichCursor:0};state=await enrichBatch(call,state,1);state=await enrichBatch(call,state,1);assert.equal(Object.keys(state.enriched).length,2);assert.equal(state.enrichCursor,2);assert.equal(calls.filter(x=>x.startsWith("get_code")).length,1)});

function fixture({ambiguousSwap=false,missingApprovals=false}={}){
  const swap=h(1),third=h(2),self=h(3),failed=h(4),approval=h(5),ts=100;
  const transfers=[
    {tx_hash:swap,block_number:1,log_index:0,ts,token:tokenA,token_symbol:"USDC",token_decimals:6,amount:"1000000",from_addr:wallet,to_addr:router},
    {tx_hash:swap,block_number:1,log_index:1,ts,token:tokenB,token_symbol:"TOK",token_decimals:18,amount:"2000000000000000000",from_addr:router,to_addr:wallet},
    {tx_hash:third,block_number:2,log_index:0,ts:101,token:tokenA,token_symbol:"USDC",token_decimals:6,amount:"7",from_addr:wallet,to_addr:other},
    {tx_hash:self,block_number:3,log_index:0,ts:102,token:tokenA,token_symbol:"USDC",token_decimals:6,amount:"9",from_addr:wallet,to_addr:wallet}
  ];
  const approvals=[{tx_hash:approval,block_number:5,log_index:0,ts:104,token:tokenA,owner:wallet,spender:router,amount:(2n**256n-1n).toString()}];
  const transactions=[swap,failed,approval].map((hash,index)=>({tx_hash:hash,hash,ts:100+index,block_number:index+1}));
  const enriched={
    [swap]:{transaction:{from:wallet,to:router,blockNumber:"0x1",value:"0x0",input:"0xabcdef01"},receipt:{status:"0x1",gasUsed:"0xa",effectiveGasPrice:"0x2",logs:ambiguousSwap?[]:[{address:router,topics:[SWAP_TOPIC],logIndex:"0x2"}]}},
    [third]:{transaction:{from:other,to:router,blockNumber:"0x2",value:"0x0",input:"0x"},receipt:{status:"0x1",gasUsed:"0x20",effectiveGasPrice:"0x2",logs:[]}},
    [self]:{transaction:{from:wallet,to:wallet,blockNumber:"0x3",value:"0x0",input:"0x"},receipt:{status:"0x1",gasUsed:"0x1",effectiveGasPrice:"0x1",logs:[]}},
    [failed]:{transaction:{from:wallet,to:router,blockNumber:"0x4",value:"0x10",input:"0xdeadbeef"},receipt:{status:"0x0",gasUsed:"0x5",effectiveGasPrice:"0x3",logs:[]}},
    [approval]:{transaction:{from:wallet,to:tokenA,blockNumber:"0x5",value:"0x0",input:"0x095ea7b3"},receipt:{status:"0x1",gasUsed:"0x4",effectiveGasPrice:"0x2",logs:[]}}
  };
  const results={transactions:{observations:transactions},"token-transfers":{observations:transfers}};if(!missingApprovals)results.approvals={observations:approvals};
  return{jobId:"job",wallet,range:{startUtc:"1970-01-01T00:01:40.000Z",endUtc:"1970-01-01T00:02:00.000Z",semantics:"[start inclusive, end exclusive)"},boundaries:{firstIncluded:{block:1,timestamp:"1970-01-01T00:01:40.000Z"},firstExcluded:{block:6,timestamp:"1970-01-01T00:02:00.000Z"}},discovery:{results,failures:missingApprovals?[{source:"approvals",error:"unavailable"}]:[],complete:!missingApprovals},hashes:[swap,third,self,failed,approval],enriched,codes:{[router]:"0x12",[tokenA]:"0x12",[wallet]:"0x"}};
}

test("transfer direction, self-transfer, and transferFrom attribution remain distinct",()=>{const report=buildReport(fixture(),new Date(0));const third=report.activities.find(row=>row.transactionHash===h(2));assert.equal(third.direction,"OUT");assert.equal(third.transactionFrom,other);assert.equal(report.categoryTotals.transfersOut[0].raw,"1000007");assert.equal(report.activities.find(row=>row.transactionHash===h(3)).direction,"SELF")});
test("swap requires swap event and wallet input/output, not transfer pair alone",()=>{assert.equal(buildReport(fixture()).categoryTotals.swaps.transactionCount,1);assert.equal(buildReport(fixture({ambiguousSwap:true})).categoryTotals.swaps.transactionCount,0)});
test("approval grant, revoke semantics and unlimited are permission-only",()=>{const report=buildReport(fixture());assert.equal(report.categoryTotals.approvals.unlimited,1);assert.match(report.activities.find(row=>row.category==="APPROVAL").classificationEvidence,/Historical Approval/)});
test("failed movement is excluded while wallet-paid failed gas is included once",()=>{const report=buildReport(fixture());assert.equal(report.summary.failed,1);assert.equal(report.categoryTotals.gas.raw,"44");assert.ok(!report.activities.some(row=>row.transactionHash===h(4)&&row.category==="TRANSFER"))});
test("mixed decimals retain raw integers and exact formatting",()=>{const report=buildReport(fixture());assert.equal(formatUnits("1000000",6),"1");assert.equal(report.categoryTotals.transfersIn.find(row=>row.symbol==="TOK").formatted,"2")});
test("missing source is UNKNOWN/PARTIAL, never rendered as complete zero",()=>{const report=buildReport(fixture({missingApprovals:true}));assert.equal(report.coverage.status,"PARTIAL");assert.equal(report.coverage.categories.approvals,"UNKNOWN")});
test("CSV escapes formula injection and exports exactly persisted activity rows",()=>{const report=buildReport(fixture());report.activities[0].symbol="=CMD";const csv=reportCsv(report);assert.match(csv,/"'=CMD"/);assert.equal(csv.trim().split("\r\n").length-1,report.activities.length);assert.match(reportMarkdown(report),new RegExp(String(report.summary.uniqueTransactions)))});
test("saved report recovery returns the unchanged persisted payload",async()=>{let payload;const db={prepare(sql){return{bind(...args){return{run:async()=>{payload=args.at(-1)},first:async()=>({payload})}}}}};const report=buildReport(fixture());await saveReport(db,report);assert.deepEqual(await getReport(db,report.id),report)});

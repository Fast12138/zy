/**
 * 统一梦时代签到脚本
 *
 * 环境变量：
 *   QH  账号信息，格式：wid#openId，多账号用换行或 & 分隔
 *   抓包链接 https://xapi.weimob.com/fe/mapi/user/loginX 在响应里面都有这个两个参数
 * 活动入口：
 *   https://picui.ogmua.cn/s1/2026/07/24/6a625750543d2.webp
 *
 * Cron: 30 8 * * *
 */

const crypto = require("crypto");
const http = require("http");
const https = require("https");
const { URL } = require("url");

let sendNotify = null;
try { sendNotify = require("./sendNotify").sendNotify; } catch (e) {}

// ===================== 常量 =====================
const BASE_URL = "https://farmgames.ioutu.cn";
const SHARE_TOMATO_USER_ID = "3879";
const PUBLIC_KEY_B64 =
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA70sK419vy3MabW3lEGlk" +
  "7Zh1u78OdnVlioVazp5Y46eBh+/TDqo/wZ9VrQ/4MmAtoP0vJ2vmwP5gqO3WPoj" +
  "b07WddXfF1eU+5M+Rj3s0eSRrvZvBcGZ3qK0dOgZJScK66IDQazt/c4xqhDcsI" +
  "tIyNRahUqB/IKc6E80GZJvMvFtZVSCseAXC0mAJXhi1AdUOlP+3Pv0fiUVejTJp" +
  "1j7LBNWJ7Z5/8mRcclQH0vmxsdYsaV3qZiJ2d/CfNoKcwmI2IWmeZy8NP5U8Hn" +
  "0AsxPEwjdHoEqG/iy/SoA46TZL+RLtWqUSHXpaKR/VFN0rbl25SE91X8FTfLqyD" +
  "8LfGMCwRQIDAQAB";

// ===================== 工具 =====================
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

function gaussDelay(mean) {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return Math.round(Math.max(mean * 0.45, Math.min(mean * 2.2, mean + z * mean * 0.25)));
}

async function humanDelay(kind) {
  const p = { query: [450, 1400], action: [900, 2600], heavy: [1200, 3200], browse: [2500, 6500], think: [800, 2200], account: [3500, 9000] };
  const [min, max] = p[kind] || p.think;
  await sleep(gaussDelay((min + max) / 2));
}

function log(msg) {
  console.log("[" + new Date().toLocaleString("zh-CN", { hour12: false }) + "] " + msg);
}

// ===================== UA =====================
function pick(arr) { return arr[randInt(0, arr.length - 1)]; }

function buildUA() {
  const devices = [
    { m: "MI 12", b: "TKQ1.220829.002", a: "13" },
    { m: "MI 13", b: "UKQ1.230804.001", a: "14" },
    { m: "Redmi K70", b: "UKQ1.230917.001", a: "14" },
    { m: "Mate 60", b: "HUAWEIALN-AL00", a: "12" },
    { m: "Find X6", b: "UKQ1.230924.001", a: "14" },
    { m: "X100", b: "UP1A.231005.007", a: "14" },
  ];
  const d = pick(devices);
  const w = pick(["8.0.49.2600", "8.0.50.2701", "8.0.51.2720", "8.0.52.2740"]);
  const hex = pick(["2800313A", "2800321D", "28003310", "28003414"]);
  const sdk = pick(["20240102", "20240206", "20240305", "20240402"]);
  const c = pick(["119.0.6045.193", "120.0.6099.210", "121.0.6167.178", "122.0.6261.119"]);
  const xweb = String(randInt(11700, 12950));
  return "Mozilla/5.0 (Linux; Android " + d.a + "; " + d.m + " Build/" + d.b + "; wv) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/" + c + " Mobile Safari/537.36 " +
    "XWEB/" + xweb + " MMWEBSDK/" + sdk + " MMWEBID/" + randInt(1800, 9999) + " " +
    "MicroMessenger/" + w + "(" + hex + ") WeChat/arm64 Weixin " +
    "NetType/WIFI Language/zh_CN ABI/arm64 MiniProgramEnv/android WMPF/1.2.0";
}

// ===================== 加密 =====================
function encryptBody(obj) {
  const plain = Buffer.from(JSON.stringify(obj), "utf8");
  const aesKey = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", aesKey, iv);
  const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  const dataBuf = Buffer.concat([enc, tag]);
  const pem = "-----BEGIN PUBLIC KEY-----\n" + PUBLIC_KEY_B64.match(/.{1,64}/g).join("\n") + "\n-----END PUBLIC KEY-----";
  const encKey = crypto.publicEncrypt({ key: pem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, aesKey);
  return { data: dataBuf.toString("base64"), key: encKey.toString("base64"), iv: iv.toString("base64") };
}

// ===================== HTTP =====================
function request(method, url, opts) {
  return new Promise(function (resolve, reject) {
    try {
      var u = new URL(url);
      var isHttps = u.protocol === "https:";
      var data = opts.body == null ? null : Buffer.from(opts.body, "utf8");
      var headers = Object.assign({}, opts.headers || {}, { Host: u.host });
      if (data) headers["Content-Length"] = Buffer.byteLength(data);
      var lib = isHttps ? https : http;
      var req = lib.request({ protocol: u.protocol, hostname: u.hostname, port: u.port || (isHttps ? 443 : 80), path: u.pathname + u.search, method: method, headers: headers, timeout: 20000 }, function (res) {
        var chunks = [];
        res.on("data", function (c) { chunks.push(c); });
        res.on("end", function () {
          var text = Buffer.concat(chunks).toString("utf8");
          var json = null;
          try { json = JSON.parse(text); } catch (_) {}
          resolve({ status: res.statusCode, text: text, json: json });
        });
      });
      req.on("error", reject);
      req.on("timeout", function () { req.destroy(new Error("timeout")); });
      if (data) req.write(data);
      req.end();
    } catch (e) { reject(e); }
  });
}

// ===================== 客户端 =====================
function TomatoClient(account, index) {
  this.name = "账号" + index;
  this.openId = String(account.openId).trim();
  this.wid = String(account.wid).trim();
  this.token = null;
  this.user = null;
  this.ua = buildUA();
  this.logs = [];
}

TomatoClient.prototype.out = function (msg) {
  log("[" + this.name + "] " + msg);
  this.logs.push(msg);
};

TomatoClient.prototype.referer = function () {
  return BASE_URL + "/?wid=" + this.wid + "&openId=" + this.openId + "&shareTomatoUserId=" + SHARE_TOMATO_USER_ID;
};

TomatoClient.prototype.headers = function (extra) {
  return Object.assign({
    "Accept": "application/json, text/plain, */*",
    "Content-Type": "application/json",
    "User-Agent": this.ua,
    "Referer": this.referer(),
    "Origin": BASE_URL,
    "Accept-Language": "zh-CN,zh;q=0.9",
    "Accept-Encoding": "identity",
    "X-Requested-With": "com.tencent.mm",
    "Connection": "keep-alive",
  }, extra || {});
};

TomatoClient.prototype.api = async function (method, path, opts) {
  opts = opts || {};
  var h = this.headers();
  if (opts.auth !== false && this.token) h.Authorization = this.token;
  var payload = null;
  if (opts.body != null) {
    if (opts.encrypt) {
      payload = JSON.stringify(encryptBody(opts.body));
      h["X-Request-Encrypted"] = "true";
    } else {
      payload = JSON.stringify(opts.body);
    }
  } else if (method === "POST") {
    payload = "";
  }
  var res = await request(method, BASE_URL + path, { headers: h, body: payload });
  if (!res.json) throw new Error(method + " " + path + " 非JSON响应 status=" + res.status);
  return res.json;
};

TomatoClient.prototype.login = async function () {
  this.out("正在登录...");
  var resp = await this.api("POST", "/api/web/open/tomato/login", {
    body: { openId: this.openId, wid: this.wid, shareTomatoUserId: SHARE_TOMATO_USER_ID, queryCardStatus: true },
    encrypt: true,
    auth: false,
  });
  if (resp.code !== 200 || !resp.data || !resp.data.token) throw new Error("登录失败: " + JSON.stringify(resp));
  this.token = resp.data.token;
  this.user = resp.data;
  this.out("登录成功: " + (resp.data.nickName || "未设置昵称"));
};

TomatoClient.prototype.home = async function () {
  var resp = await this.api("GET", "/api/web/member/tomato/home");
  if (resp.code !== 200) throw new Error("首页失败: " + JSON.stringify(resp));
  this.user = Object.assign({}, this.user, resp.data);
  return resp.data;
};

TomatoClient.prototype.pageVisit = async function (p) {
  return await this.api("POST", "/api/web/member/tomato/page-visit", { body: { pagePath: p || "/pages/home/index" }, encrypt: true });
};

TomatoClient.prototype.getTasks = async function () {
  var resp = await this.api("GET", "/api/web/member/tomato/tasks");
  if (resp.code !== 200) throw new Error("任务列表失败: " + JSON.stringify(resp));
  return resp.data || [];
};

TomatoClient.prototype.completeTask = async function (task) {
  return await this.api("POST", "/api/web/member/tomato/tasks/complete", {
    body: { taskType: task.taskType, browseTarget: task.browseTarget || "" },
    encrypt: true,
  });
};

TomatoClient.prototype.doTasks = async function () {
  var tasks = await this.getTasks();
  var completed = 0;
  for (var i = 0; i < tasks.length; i++) {
    var t = tasks[i];
    if (String(t.completed) === "1") { this.out("  ✓ " + t.taskName + "（已完成）"); continue; }
    if (t.taskType === "FRIEND_STEAL_ENERGY") continue;
    try {
      if (t.taskType === "BROWSE") { await this.pageVisit(t.browseTarget || "/pages/home/index"); await humanDelay("browse"); }
      var resp = await this.completeTask(t);
      if (resp.code === 200) { this.out("  ✓ " + t.taskName + "（" + ((resp.data && resp.data.rewardText) || t.rewardText || "已领取") + "）"); completed++; }
      else { this.out("  ✗ " + t.taskName + "（" + (resp.msg || "失败") + "）"); }
    } catch (e) { this.out("  ✗ " + t.taskName + "（" + e.message + "）"); }
    await humanDelay("think");
  }
  this.out("任务完成 " + completed + " 个");
};

TomatoClient.prototype.waterAll = async function () {
  var h = await this.home();
  if (Number(h.energyBalance || 0) <= 0) { this.out("使用能量：当前没有可用能量"); return; }
  var resp = await this.api("POST", "/api/web/member/tomato/energy/use", { body: null });
  if (resp.code !== 200) { this.out("使用能量失败: " + (resp.msg || "")); return; }
  var d = resp.data || {};
  this.out("使用能量：消耗" + (d.usedEnergyAmount || 0) + "，获得番茄" + (d.gainedTomatoAmount || 0));
};

TomatoClient.prototype.stealFromFriends = async function () {
  var resp = await this.api("GET", "/api/web/member/tomato/friends", { query: { pageNum: "1", pageSize: "50" } });
  if (resp.code !== 200) { this.out("好友列表失败"); return; }
  var rows = (resp.rows || []).filter(function (f) { return Number(f.friendStatus) === 0 && f.friendTomatoUserId; });
  if (!rows.length) { this.out("好友能量：暂无可收取能量"); return; }
  var stolen = 0, energy = 0, failed = 0;
  for (var i = 0; i < rows.length; i++) {
    try {
      var fh = await this.api("GET", "/api/web/member/tomato/friends/" + rows[i].friendTomatoUserId + "/home");
      if (fh.code !== 200) continue;
      var amount = Number((fh.data || {}).stealAmount || 0);
      if (String((fh.data || {}).canSteal) !== "1" || amount <= 0) continue;
      var sr = await this.api("POST", "/api/web/member/tomato/friends/steal", { body: { friendTomatoUserId: rows[i].friendTomatoUserId }, encrypt: true });
      if (sr.code === 200) { stolen++; energy += amount; } else { failed++; }
    } catch (e) { failed++; }
    await humanDelay("action");
  }
  if (stolen) { this.out("好友能量：收取" + stolen + "位，共" + energy + "能量" + (failed ? "（失败" + failed + "位）" : "")); }
  else if (failed) { this.out("好友能量：收取失败" + failed + "位"); }
  else { this.out("好友能量：暂无可收取能量"); }
};

TomatoClient.prototype.runDaily = async function () {
  this.out("===== 开始处理 =====");
  await this.login();
  await humanDelay("think");
  await this.pageVisit("/pages/home/index");
  await humanDelay("think");
  var h = await this.home();
  this.out("当前状态：能量" + h.energyBalance + "，番茄" + h.tomatoBalance + "，" + (h.stageName || "") + " " + (h.currentExp || 0) + "/" + (h.stageRequiredExp || 0));
  await this.doTasks();
  await humanDelay("think");
  await this.waterAll();
  await humanDelay("think");
  await this.stealFromFriends();
  h = await this.home();
  this.out("最终状态：能量" + h.energyBalance + "，番茄" + h.tomatoBalance + "，" + (h.stageName || "") + " " + (h.currentExp || 0) + "/" + (h.stageRequiredExp || 0));
  this.out("===== 处理完成 =====");
};

// ===================== 账号解析 =====================
function parseAccounts() {
  var raw = process.env.QH || "";
  if (!raw) return [];
  return raw.replace(/\r\n/g, "\n").replace(/&/g, "\n").split("\n")
    .map(function (s) { return s.trim(); })
    .filter(function (s) { return s && !s.startsWith("#"); })
    .map(function (line) {
      var parts = line.split("#");
      if (parts.length >= 2 && parts[0].trim() && parts[1].trim()) {
        return { wid: parts[0].trim(), openId: parts[1].trim() };
      }
      return null;
    })
    .filter(Boolean);
}

// ===================== 主程序 =====================
async function main() {
  log("统一梦时代签到脚本启动");
  var accounts = parseAccounts();
  if (!accounts.length) {
    log("没有可用账号，请配置环境变量 QH，格式：wid#openId");
    if (sendNotify) await sendNotify("统一梦时代签到", "没有可用账号");
    return;
  }
  log("加载 " + accounts.length + " 个账号");

  var results = [];
  var ok = 0;
  for (var i = 0; i < accounts.length; i++) {
    var client = new TomatoClient(accounts[i], i + 1);
    try { await client.runDaily(); ok++; } catch (e) { client.out("处理异常: " + e.message); }
    results.push(client);
    if (i < accounts.length - 1) await humanDelay("account");
  }

  var title = "统一梦时代签到" + (ok === accounts.length ? "：全部成功" : "：成功" + ok + "/" + accounts.length);
  var report = "统一梦时代签到报告\n时间: " + new Date().toLocaleString("zh-CN", { hour12: false }) + "\n" + "─".repeat(30);
  for (var j = 0; j < results.length; j++) {
    report += "\n" + results[j].logs.join("\n") + "\n" + "─".repeat(30);
  }
  log("\n" + report);
  if (sendNotify) { await sendNotify(title, report); log("通知已发送"); }
}

main().catch(function (e) { console.error("脚本异常:", e); if (sendNotify) sendNotify("统一梦时代签到：异常", e.message); });
import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import puppeteer from "puppeteer-core";

test("mobile inbox keeps long previews, badges and dates inside the list", async()=>{
  const browser=await puppeteer.launch({
    executablePath:execFileSync("which",["chromium"],{encoding:"utf8"}).trim(),
    headless:true,args:["--no-sandbox","--disable-dev-shm-usage"],
  });
  try {
    const page=await browser.newPage();
    const css=["rescue-inbox.css","mobile-conversations.css"].map(name=>
      readFileSync(`client/src/components/rescue-inbox/${name}`,"utf8")).join("\n");
    for(const width of [320,390,767]) {
      await page.setViewport({width,height:844});
      await page.setContent(`<style>*{box-sizing:border-box}body{margin:16px}button{font:inherit} ${css}</style>
        <div class="rescue-inbox"><div class="ri-workspace ri-show-list"><div class="ri-list">
        ${Array.from({length:7},()=>`<button class="ri-thread waiting"><div class="ri-toolbar">
        <strong>+12025550123</strong><span class="ri-badge waiting">Needs a person</span></div>
        <p>${"A long incoming message ".repeat(30)}</p><div class="ri-toolbar">
        <small>General</small><small>Nov 19 at 11:29 AM</small></div></button>`).join("")}
        </div><div class="ri-conversation-panel">Hidden detail</div></div></div>`);
      const result=await page.evaluate(()=>{
        const list=document.querySelector(".ri-list").getBoundingClientRect();
        const cards=[...document.querySelectorAll(".ri-thread")].map(x=>x.getBoundingClientRect());
        return {
          badgesVisible:[...document.querySelectorAll(".ri-badge")].every(x=>{
            const box=x.getBoundingClientRect();return box.left>=list.left && box.right<=list.right;
          }),
          fits:document.documentElement.scrollWidth<=innerWidth,
          fullList:cards.at(-1).bottom<=list.bottom+1,
        };
      });
      assert.deepEqual(result,{badgesVisible:true,fits:true,fullList:true},`viewport ${width}`);
    }
  } finally {await browser.close();}
});

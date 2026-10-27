import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { prepareCampaignImage, CAMPAIGN_IMAGE_MAX_BYTES } from "../server/lib/expense-campaign-image";

test("campaign images accept supported formats and produce browser-ready WebP", async () => {
  for (const format of ["jpeg", "png", "webp"] as const) {
    const source = await sharp({ create: { width: 120, height: 80, channels: 4, background: "#88aa77" } })
      .toFormat(format).toBuffer();
    const output = await prepareCampaignImage(source);
    const info = await sharp(output).metadata();
    assert.equal(info.format, "webp");
    assert.equal(info.width, 120);
    assert.equal(info.height, 80);
  }
});

test("campaign images resize large photos without distorting their proportions", async () => {
  const source = await sharp({ create: { width: 3000, height: 1500, channels: 3, background: "#ffffff" } })
    .png().toBuffer();
  const info = await sharp(await prepareCampaignImage(source)).metadata();
  assert.equal(info.width, 2400);
  assert.equal(info.height, 1200);
});

test("campaign images reject oversized, empty, corrupt and disguised non-image files", async () => {
  for (const source of [
    Buffer.alloc(0), Buffer.alloc(CAMPAIGN_IMAGE_MAX_BYTES + 1),
    Buffer.from("not a photograph"),
    Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20"/></svg>'),
  ]) {
    await assert.rejects(() => prepareCampaignImage(source));
  }
});

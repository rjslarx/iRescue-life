import test from "node:test";
import assert from "node:assert/strict";
import { isPausedResaleApi, isPausedResalePage } from "../shared/resale-availability";

test("all public resale storefront and item links are unpublished", () => {
  for (const path of ["/resale", "/resale/", "/resale/create", "/resale/item/123", "/rescue-resale", "/haseyas/rescue-resale", "/haseyas/resale/item/123"])
    assert.equal(isPausedResalePage(path), true, path);
  for (const path of ["/resale/manage", "/resale/order/123", "/dashboard/community-resale", "/api/community-resale", "/rescue-vend", "/puzzle"])
    assert.equal(isPausedResalePage(path), false, path);
  assert.equal(isPausedResalePage("/rescue-resale", "order=123"), false);
  assert.equal(isPausedResalePage("/rescue-resale", "payoutSetup=return"), false);
});

test("pause blocks new sales and listings but preserves existing obligations", () => {
  for (const [method, path] of [["GET", "/items"], ["GET", "/items/123"], ["GET", "/partners"], ["POST", "/checkout"], ["POST", "/images"], ["POST", "/items"], ["PUT", "/items/123"], ["POST", "/items/123/price"], ["POST", "/conversations/123/offer"]])
    assert.equal(isPausedResaleApi(method, path), true, path);
  for (const [method, path] of [["GET", "/me"], ["POST", "/auth/verify"], ["POST", "/items/123/withdraw"], ["GET", "/orders/123"], ["POST", "/orders/123/cancel"], ["POST", "/orders/123/confirm-pickup"], ["POST", "/payout-account/onboard"], ["POST", "/admin/orders/123/sync"]])
    assert.equal(isPausedResaleApi(method, path), false, path);
});

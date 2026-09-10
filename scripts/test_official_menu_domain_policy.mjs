#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizedHost, sameBoundMenuDomainFamily } from './official_menu_domain_policy.mjs';

const HERE=path.dirname(fileURLToPath(import.meta.url));
const ROOT=path.resolve(HERE,'..');

assert.equal(normalizedHost('https://www.ringerhut.jp/menu/'),'ringerhut.jp');
assert.equal(sameBoundMenuDomainFamily('https://www.ringerhut.jp/menu/','https://shop.ringerhut.jp/detail/r0494/'),true);
assert.equal(sameBoundMenuDomainFamily('https://www.skylark.co.jp/gusto/menu/','https://store-info.skylark.co.jp/gusto/map/'),true);
assert.equal(sameBoundMenuDomainFamily('https://menu.example.com/','https://example.com/store/'),true);
assert.equal(sameBoundMenuDomainFamily('https://example.com/menu/','https://example.com/store/'),true);

assert.equal(sameBoundMenuDomainFamily('https://menu.example.com/','https://shop.example.com/store/'),false,'sibling subdomains must not be treated as an automatically trusted family hop');
assert.equal(sameBoundMenuDomainFamily('https://example.com.evil.test/menu/','https://example.com/store/'),false);
assert.equal(sameBoundMenuDomainFamily('https://evil-example.com/menu/','https://example.com/store/'),false);
assert.equal(sameBoundMenuDomainFamily('https://example.co/menu/','https://example.com/store/'),false);
assert.equal(sameBoundMenuDomainFamily('not a url','https://example.com/store/'),false);

const collector=fs.readFileSync(path.join(ROOT,'scripts/collect_google_inventory_recommendations.mjs'),'utf8');
const calls=collector.match(/sameBoundMenuDomainFamily\(url, base\)/g)||[];
assert.equal(calls.length,2,'both anchor and structured menu discovery must use the same narrow domain-family policy');
assert.doesNotMatch(collector,/url\.hostname\s*!==\s*base\.hostname/,'exact-host-only menu filtering must not return');
assert.match(collector,/menuLinkDomainPolicy/);
assert.match(collector,/sibling and unrelated domains are rejected/);

console.log(JSON.stringify({status:'pass',allowedRootSubdomainTransitions:2,siblingSubdomainsRejected:true,lookalikesRejected:true,collectorCallSites:calls.length}));

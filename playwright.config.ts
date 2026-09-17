import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'./e2e',timeout:45000,expect:{timeout:15000},workers:1,retries:0,
 use:{baseURL:'http://127.0.0.1:4173/agent-canvas/',viewport:{width:1440,height:1100},screenshot:'only-on-failure',trace:'retain-on-failure'},
 webServer:{command:'node scripts/serve-demo.mjs',url:'http://127.0.0.1:4173/agent-canvas/',reuseExistingServer:false},
 reporter:[['list'],['html',{open:'never'}]],
});

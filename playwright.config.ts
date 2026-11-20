import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./e2e',fullyParallel:false,workers:1,timeout:60000,retries:0,reporter:[['list'],['html',{open:'never'}]],use:{baseURL:'http://127.0.0.1:15173',browserName:'chromium',headless:true,trace:'retain-on-failure',screenshot:'only-on-failure'},projects:[{name:'chromium',use:{viewport:{width:1440,height:1000}}}]});

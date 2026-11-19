// Development-only, synthetic fixture for the focused callback UI test.
import {randomUUID} from "node:crypto";
import bcrypt from "bcrypt";
import {db,pool} from "../server/db";
import {tenants,users} from "../shared/schema";
import {defaultHelpSettings} from "../shared/rescue-help";
import {eq} from "drizzle-orm";
if(process.env.REPLIT_DEPLOYMENT==="1") throw new Error("Test fixture cannot run in production");
const cleanup=process.argv[2];
if(cleanup){
  if(!/^[0-9a-f-]{36}$/.test(cleanup)) throw new Error("Invalid fixture identifier");
  const tenant=(await pool.query("SELECT subdomain FROM tenants WHERE id=$1",[cleanup])).rows[0];
  if(!tenant?.subdomain.startsWith("callback-ui-")) throw new Error("Not a callback fixture");
  await db.delete(tenants).where(eq(tenants.id,cleanup));
}else{
  const tenantId=randomUUID(),userId=randomUUID(),threadId=randomUUID();
  const slug=`callback-ui-${tenantId.slice(0,8)}`,email=`${slug}@example.test`,password=`Callback-Test-${randomUUID()}`;
  await db.insert(tenants).values({id:tenantId,subdomain:slug,name:"Callback UI Test",subscriptionTier:"professional",wizardCompleted:true});
  await db.insert(users).values({id:userId,tenantId,email,fullName:"Callback Test Admin",passwordHash:await bcrypt.hash(password,10),roles:["admin"],phone:"+12025550100"});
  await pool.query("INSERT INTO rescue_help_settings(tenant_id,phone,enabled,data) VALUES($1,$2,true,$3)",
    [tenantId,`+1202555${String(Math.floor(Math.random()*10000)).padStart(4,"0")}`,{...defaultHelpSettings,teamIds:[userId]}]);
  await pool.query("INSERT INTO rescue_help_threads(id,tenant_id,phone,status,assignee_id) VALUES($1,$2,'+12025550123','human',$3)",[threadId,tenantId,userId]);
  await pool.query("INSERT INTO rescue_help_messages(id,thread_id,kind,body,status) VALUES($1,$2,'inbound','Could someone call me back about fostering?','received')",[randomUUID(),threadId]);
  console.log(JSON.stringify({tenantId,userId,threadId,slug,email,password}));
}
await pool.end();

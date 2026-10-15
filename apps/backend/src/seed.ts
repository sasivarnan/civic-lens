import { randomUUID } from "node:crypto";
import { sql } from "./db.js";
import { config } from "./config.js";
if (config.NODE_ENV === "production")
  throw new Error("Demo seeding is disabled in production.");
await sql.begin(async (tx) => {
  for (const name of ["Reporter", "Community Member", "Admin"]) {
    const email =
      name === "Community Member"
        ? "community@civiclens.test"
        : name.toLowerCase() + "@civiclens.test";
    const [u] =
      await tx`INSERT INTO users(id,name,email,role) VALUES(${randomUUID()},${name},${email},${name === "Admin" ? "admin" : "member"}) ON CONFLICT(email) DO UPDATE SET name=excluded.name RETURNING id`;
    await tx`INSERT INTO member_profiles(user_id,demo) VALUES(${u!.id},true) ON CONFLICT(user_id) DO NOTHING`;
  }
  const [reporter] =
    await tx`SELECT id FROM users WHERE email='reporter@civiclens.test'`;
  const examples = [
    {
      id: "8f102b20-6654-4b79-9de6-dc407f302001",
      title: "Uneven ramp near a neighbourhood crossing",
      description:
        "Seeded demo: a resident reports an uneven ramp surface. No real incident or AI assessment is claimed.",
      category: "accessibility",
      lat: 12.978,
      lng: 77.601,
    },
    {
      id: "8f102b20-6654-4b79-9de6-dc407f302002",
      title: "Footpath access needs a closer look",
      description:
        "Seeded demo: a resident reports a blocked walking route. Add reviewed evidence before making a finding.",
      category: "pedestrian",
      lat: 12.966,
      lng: 77.59,
    },
    {
      id: "8f102b20-6654-4b79-9de6-dc407f302003",
      title: "Reported road surface damage",
      description:
        "Seeded demo: a resident reports road damage. The example has no photo, confirmed damage, or measured depth.",
      category: "pothole",
      lat: 12.989,
      lng: 77.61,
    },
  ];
  for (const i of examples) {
    await tx`INSERT INTO issues(id,author_id,title,description,category,latitude,longitude,point,location_source,observation_date,demo) VALUES(${i.id},${reporter!.id},${i.title},${i.description},${i.category},${i.lat},${i.lng},ST_SetSRID(ST_MakePoint(${i.lng},${i.lat}),4326)::geography,'coordinates',CURRENT_DATE,true) ON CONFLICT(id) DO NOTHING`;
  }
});
console.log(
  "Created labelled demo issues and accounts. Sign in through the local mailbox; there is no authentication bypass.",
);
await sql.end();

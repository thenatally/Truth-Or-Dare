import Surreal, { RecordId } from "surrealdb";
import fs from "fs/promises";
import path from "path";

const db = new Surreal();

async function connectDB() {
    while (true) {
        try {
            await db.connect(
                process.env.SURREAL_URI ?? "ws://localhost:8000/rpc",
                {
                    namespace: "tod",
                    database: "tod",
                    auth: { username: "root", password: "root" },
                },
            ).catch((error: any) => {
                if (process.env.SURREAL_URI) {
                    throw error;
                }
                db.connect(
                    "ws://host.docker.internal:8000/rpc",
                    {
                        namespace: "tod",
                        database: "tod",
                        auth: { username: "root", password: "root" },
                    },
                );
            });
            console.log("Connected to DB");
            break;
        } catch (error: any) {
            // console.error("Failed to connect to DB", error.message);
            console.log("Waiting for DB...");
            await new Promise((resolve) => setTimeout(resolve, 500));
        }
    }
}

await connectDB();

async function set<T>(tb: string, id: string, data: T) {
    const record = { d: { data: data } };
    await db.upsert(new RecordId(tb, id), record);
    if (process.env.NODE_ENV === "development") {
        await writeJSON(tb, id, record);
    }
}

async function get(tb: string, id: string) {
    const record: any = await db.select(new RecordId(tb, id));
    return record?.d?.data;
}

async function del(tb: string, id: string): Promise<void> {
    await db.delete(new RecordId(tb, id));
    if (process.env.NODE_ENV === "development") {
        await deleteJSON(tb, id);
    }
}

async function writeJSON(tb: string, id: string, data: any) {
    const filePath = path.join(process.cwd(), "data", tb, `${id}.json`);
    console.log(`Writing JSON to ${filePath}`);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

async function deleteJSON(tb: string, id: string) {
    const filePath = path.join(process.cwd(), "data", tb, `${id}.json`);
    try {
        await fs.unlink(filePath);
    } catch (error) {
        // if (error.code !== "ENOENT") {
        console.error(`Failed to delete JSON file ${filePath}:`, error);
        // }
    }
}

export class Store<dataT> {
    private name: string;
    private lock: Promise<void> = Promise.resolve();
    defaultV: dataT;

    constructor(name: string, defaultValue: dataT) {
        if ((globalThis as any).constructed?.includes(name)) {
            throw new RangeError(
                `Cannot create a second database for ${name}, they will have conflicting data`,
            );
        }
        ((globalThis as any).constructed ||= []).push(name);
        this.defaultV = defaultValue;
        this.name = name;
    }

    private async withLock<T>(fn: () => Promise<T>): Promise<T> {
        const result = this.lock.then(fn);
        this.lock = result.catch(() => {}).then(() => {});
        return result;
    }

    async getData(): Promise<dataT> {
        return (await get("store", this.name)) ?? this.defaultV;
    }

    /**
     * @deprecated use Store.update instead.
     */
    async setData(data: dataT) {
        await set("store", this.name, data);
    }
    async update(
        updater: (current: dataT) => dataT | Promise<dataT>,
    ): Promise<void> {
        return this.withLock(async () => {
            const current = await this.getData();
            const updated = await updater(current);
            await this.setData(updated);
        });
    }
}

export { connectDB, db, del, get, set };

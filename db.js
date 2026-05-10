const initSqlJs = require('sql.js');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'analytics.db');
const USE_PG = !!process.env.DATABASE_URL;

class AnalyticsDB {
  constructor() {
    this.db = null; // sql.js instance (local) or pg Pool (Railway)
  }

  async init() {
    if (USE_PG) {
      await this._initPG();
    } else {
      await this._initSQLite();
    }
    return this;
  }

  // ----------------------------------------------------------------
  // PostgreSQL (Railway)
  // ----------------------------------------------------------------
  async _initPG() {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    // Test connection
    const client = await pool.connect();
    client.release();
    await pool.query(`CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      primary_emotion TEXT,
      emotion_intensity INTEGER,
      emotion_tags TEXT,
      key_topics TEXT,
      suggestion TEXT,
      message_count INTEGER DEFAULT 0,
      visitor_id TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )`);
    this.db = pool;
    console.log('📊 使用 PostgreSQL (Railway)');
  }

  async _queryPG(text, params) {
    return this.db.query(text, params);
  }

  // ----------------------------------------------------------------
  // SQLite (本地开发)
  // ----------------------------------------------------------------
  async _initSQLite() {
    const SQL = await initSqlJs();
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    if (fs.existsSync(DB_PATH)) {
      this.db = new SQL.Database(fs.readFileSync(DB_PATH));
    } else {
      this.db = new SQL.Database();
    }

    this.db.run(`CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      primary_emotion TEXT,
      emotion_intensity INTEGER,
      emotion_tags TEXT,
      key_topics TEXT,
      suggestion TEXT,
      message_count INTEGER DEFAULT 0,
      visitor_id TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    )`);
    this._persistSQLite();
    console.log('📊 使用 SQLite (本地开发)');
  }

  _persistSQLite() {
    fs.writeFileSync(DB_PATH, Buffer.from(this.db.export()));
  }

  _execSQLite(sql) {
    return this.db.exec(sql);
  }

  _runSQLite(sql, params) {
    this.db.run(sql, params);
    this._persistSQLite();
  }

  // ----------------------------------------------------------------
  // 公共接口
  // ----------------------------------------------------------------
  async saveSession(s) {
    const tags = s.emotionTags ? JSON.stringify(s.emotionTags) : null;
    const topics = s.keyTopics ? JSON.stringify(s.keyTopics) : null;

    if (USE_PG) {
      await this._queryPG(
        `INSERT INTO sessions (id, date, primary_emotion, emotion_intensity, emotion_tags, key_topics, suggestion, message_count, visitor_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (id) DO UPDATE SET
           primary_emotion=$3, emotion_intensity=$4, emotion_tags=$5,
           key_topics=$6, suggestion=$7, message_count=$8, visitor_id=$9`,
        [s.id, s.date, s.primaryEmotion ?? null, s.emotionIntensity ?? null,
         tags, topics, s.suggestion ?? null, s.messageCount ?? 0, s.visitorId ?? null]
      );
    } else {
      this._runSQLite(
        `INSERT OR REPLACE INTO sessions (id, date, primary_emotion, emotion_intensity, emotion_tags, key_topics, suggestion, message_count, visitor_id)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [s.id, s.date, s.primaryEmotion ?? null, s.emotionIntensity ?? null,
         tags, topics, s.suggestion ?? null, s.messageCount ?? 0, s.visitorId ?? null]
      );
    }
  }

  async getOverview() {
    if (USE_PG) {
      const r = await this._queryPG(`SELECT
        COUNT(*) AS total,
        COUNT(DISTINCT visitor_id) AS visitors,
        ROUND(AVG(emotion_intensity), 1) AS avg_intensity,
        ROUND(AVG(message_count), 1) AS avg_messages,
        (SELECT primary_emotion FROM sessions GROUP BY primary_emotion ORDER BY COUNT(*) DESC LIMIT 1) AS top_emotion
        FROM sessions`);
      const v = r.rows[0];
      if (!v || !v.total) return null;
      return { totalSessions: Number(v.total), uniqueVisitors: Number(v.visitors), avgIntensity: v.avg_intensity, avgMessages: v.avg_messages, topEmotion: v.top_emotion };
    } else {
      const r = this._execSQLite(`SELECT
        COUNT(*) AS total, COUNT(DISTINCT visitor_id) AS visitors,
        ROUND(AVG(emotion_intensity), 1) AS avg_intensity,
        ROUND(AVG(message_count), 1) AS avg_messages,
        (SELECT primary_emotion FROM sessions GROUP BY primary_emotion ORDER BY COUNT(*) DESC LIMIT 1) AS top_emotion
        FROM sessions`);
      if (!r[0]?.values?.length) return null;
      const v = r[0].values[0];
      return { totalSessions: v[0], uniqueVisitors: v[1], avgIntensity: v[2], avgMessages: v[3], topEmotion: v[4] };
    }
  }

  async getEmotionDistribution() {
    if (USE_PG) {
      const r = await this._queryPG(`SELECT primary_emotion, COUNT(*)::int AS c FROM sessions WHERE primary_emotion IS NOT NULL GROUP BY primary_emotion ORDER BY c DESC`);
      return r.rows.map(v => ({ emotion: v.primary_emotion, count: v.c }));
    } else {
      const r = this._execSQLite(`SELECT primary_emotion, COUNT(*) AS c FROM sessions WHERE primary_emotion IS NOT NULL GROUP BY primary_emotion ORDER BY c DESC`);
      return r[0]?.values?.map(v => ({ emotion: v[0], count: v[1] })) || [];
    }
  }

  async getTimeline(limit = 50) {
    if (USE_PG) {
      const r = await this._queryPG(`SELECT LEFT(date, 16) AS dt, primary_emotion, emotion_intensity, message_count, visitor_id FROM sessions ORDER BY date DESC LIMIT $1`, [limit]);
      return r.rows.map(v => ({ date: v.dt, emotion: v.primary_emotion, intensity: v.emotion_intensity, messages: v.message_count, visitor: v.visitor_id }));
    } else {
      const r = this._execSQLite(`SELECT substr(date,1,16) AS dt, primary_emotion, emotion_intensity, message_count, visitor_id FROM sessions ORDER BY date DESC LIMIT ${limit}`);
      return r[0]?.values?.map(v => ({ date: v[0], emotion: v[1], intensity: v[2], messages: v[3], visitor: v[4] })) || [];
    }
  }
}

module.exports = AnalyticsDB;

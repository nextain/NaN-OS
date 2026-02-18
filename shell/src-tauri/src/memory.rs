use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};

pub type MemoryDb = Arc<Mutex<Connection>>;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Session {
    pub id: String,
    pub created_at: i64,
    pub title: Option<String>,
    pub summary: Option<String>, // LTM: LLM-generated summary (filled in Phase 4.4b)
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MessageRow {
    pub id: String,
    pub session_id: String,
    pub role: String,
    pub content: String,
    pub timestamp: i64,
    pub cost_json: Option<String>,
    pub tool_calls_json: Option<String>,
}

pub fn init_db(path: &std::path::Path) -> Result<MemoryDb, String> {
    let conn =
        Connection::open(path).map_err(|e| format!("Failed to open memory DB: {}", e))?;

    conn.execute_batch("PRAGMA journal_mode=WAL;")
        .map_err(|e| format!("Failed to set WAL mode: {}", e))?;

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS sessions (
            id         TEXT PRIMARY KEY,
            created_at INTEGER NOT NULL,
            title      TEXT,
            summary    TEXT
        );

        CREATE TABLE IF NOT EXISTS messages (
            id              TEXT PRIMARY KEY,
            session_id      TEXT NOT NULL REFERENCES sessions(id),
            role            TEXT NOT NULL,
            content         TEXT NOT NULL,
            timestamp       INTEGER NOT NULL,
            cost_json       TEXT,
            tool_calls_json TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
        CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
        CREATE INDEX IF NOT EXISTS idx_sessions_created ON sessions(created_at);",
    )
    .map_err(|e| format!("Failed to create memory tables: {}", e))?;

    Ok(Arc::new(Mutex::new(conn)))
}

pub fn create_session(db: &MemoryDb, id: &str, title: Option<&str>) -> Result<Session, String> {
    let conn = db.lock().map_err(|e| format!("Lock error: {}", e))?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);

    conn.execute(
        "INSERT INTO sessions (id, created_at, title) VALUES (?1, ?2, ?3)",
        rusqlite::params![id, now, title],
    )
    .map_err(|e| format!("Insert session error: {}", e))?;

    Ok(Session {
        id: id.to_string(),
        created_at: now,
        title: title.map(String::from),
        summary: None,
    })
}

pub fn get_last_session(db: &MemoryDb) -> Result<Option<Session>, String> {
    let conn = db.lock().map_err(|e| format!("Lock error: {}", e))?;
    let mut stmt = conn
        .prepare("SELECT id, created_at, title, summary FROM sessions ORDER BY created_at DESC LIMIT 1")
        .map_err(|e| format!("Query error: {}", e))?;

    let mut rows = stmt
        .query_map([], |row| {
            Ok(Session {
                id: row.get(0)?,
                created_at: row.get(1)?,
                title: row.get(2)?,
                summary: row.get(3)?,
            })
        })
        .map_err(|e| format!("Query error: {}", e))?;

    match rows.next() {
        Some(Ok(session)) => Ok(Some(session)),
        Some(Err(e)) => Err(format!("Row error: {}", e)),
        None => Ok(None),
    }
}

pub fn get_recent_sessions(db: &MemoryDb, limit: u32) -> Result<Vec<Session>, String> {
    let conn = db.lock().map_err(|e| format!("Lock error: {}", e))?;
    let mut stmt = conn
        .prepare("SELECT id, created_at, title, summary FROM sessions ORDER BY created_at DESC LIMIT ?1")
        .map_err(|e| format!("Query error: {}", e))?;

    let rows = stmt
        .query_map([limit], |row| {
            Ok(Session {
                id: row.get(0)?,
                created_at: row.get(1)?,
                title: row.get(2)?,
                summary: row.get(3)?,
            })
        })
        .map_err(|e| format!("Query error: {}", e))?;

    let mut sessions = Vec::new();
    for row in rows {
        sessions.push(row.map_err(|e| format!("Row error: {}", e))?);
    }
    Ok(sessions)
}

pub fn update_session_title(db: &MemoryDb, session_id: &str, title: &str) -> Result<(), String> {
    let conn = db.lock().map_err(|e| format!("Lock error: {}", e))?;
    conn.execute(
        "UPDATE sessions SET title = ?1 WHERE id = ?2",
        rusqlite::params![title, session_id],
    )
    .map_err(|e| format!("Update error: {}", e))?;
    Ok(())
}

pub fn insert_message(db: &MemoryDb, msg: &MessageRow) -> Result<(), String> {
    let conn = db.lock().map_err(|e| format!("Lock error: {}", e))?;
    conn.execute(
        "INSERT INTO messages (id, session_id, role, content, timestamp, cost_json, tool_calls_json)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![
            msg.id,
            msg.session_id,
            msg.role,
            msg.content,
            msg.timestamp,
            msg.cost_json,
            msg.tool_calls_json,
        ],
    )
    .map_err(|e| format!("Insert message error: {}", e))?;
    Ok(())
}

pub fn get_session_messages(db: &MemoryDb, session_id: &str) -> Result<Vec<MessageRow>, String> {
    let conn = db.lock().map_err(|e| format!("Lock error: {}", e))?;
    let mut stmt = conn
        .prepare(
            "SELECT id, session_id, role, content, timestamp, cost_json, tool_calls_json
             FROM messages WHERE session_id = ?1 ORDER BY timestamp ASC",
        )
        .map_err(|e| format!("Query error: {}", e))?;

    let rows = stmt
        .query_map([session_id], |row| {
            Ok(MessageRow {
                id: row.get(0)?,
                session_id: row.get(1)?,
                role: row.get(2)?,
                content: row.get(3)?,
                timestamp: row.get(4)?,
                cost_json: row.get(5)?,
                tool_calls_json: row.get(6)?,
            })
        })
        .map_err(|e| format!("Query error: {}", e))?;

    let mut messages = Vec::new();
    for row in rows {
        messages.push(row.map_err(|e| format!("Row error: {}", e))?);
    }
    Ok(messages)
}

pub fn search_messages(db: &MemoryDb, query: &str, limit: u32) -> Result<Vec<MessageRow>, String> {
    let conn = db.lock().map_err(|e| format!("Lock error: {}", e))?;
    let pattern = format!("%{}%", query);
    let mut stmt = conn
        .prepare(
            "SELECT id, session_id, role, content, timestamp, cost_json, tool_calls_json
             FROM messages WHERE content LIKE ?1 ORDER BY timestamp DESC LIMIT ?2",
        )
        .map_err(|e| format!("Query error: {}", e))?;

    let rows = stmt
        .query_map(rusqlite::params![pattern, limit], |row| {
            Ok(MessageRow {
                id: row.get(0)?,
                session_id: row.get(1)?,
                role: row.get(2)?,
                content: row.get(3)?,
                timestamp: row.get(4)?,
                cost_json: row.get(5)?,
                tool_calls_json: row.get(6)?,
            })
        })
        .map_err(|e| format!("Query error: {}", e))?;

    let mut messages = Vec::new();
    for row in rows {
        messages.push(row.map_err(|e| format!("Row error: {}", e))?);
    }
    Ok(messages)
}

pub fn delete_session(db: &MemoryDb, session_id: &str) -> Result<(), String> {
    let conn = db.lock().map_err(|e| format!("Lock error: {}", e))?;
    conn.execute(
        "DELETE FROM messages WHERE session_id = ?1",
        [session_id],
    )
    .map_err(|e| format!("Delete messages error: {}", e))?;
    conn.execute("DELETE FROM sessions WHERE id = ?1", [session_id])
        .map_err(|e| format!("Delete session error: {}", e))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn test_db() -> (MemoryDb, TempDir) {
        let dir = TempDir::new().unwrap();
        let db_path = dir.path().join("test_memory.db");
        let db = init_db(&db_path).unwrap();
        (db, dir)
    }

    // --- init_db ---

    #[test]
    fn init_db_creates_tables() {
        let (db, _dir) = test_db();
        let conn = db.lock().unwrap();
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('sessions', 'messages')",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 2);
    }

    #[test]
    fn init_db_enables_wal_mode() {
        let (db, _dir) = test_db();
        let conn = db.lock().unwrap();
        let mode: String = conn
            .query_row("PRAGMA journal_mode", [], |row| row.get(0))
            .unwrap();
        assert_eq!(mode, "wal");
    }

    #[test]
    fn init_db_is_idempotent() {
        let dir = TempDir::new().unwrap();
        let db_path = dir.path().join("test.db");
        let _db1 = init_db(&db_path).unwrap();
        let _db2 = init_db(&db_path).unwrap();
    }

    // --- create_session ---

    #[test]
    fn create_session_stores_and_returns() {
        let (db, _dir) = test_db();
        let session = create_session(&db, "s1", Some("Test Session")).unwrap();
        assert_eq!(session.id, "s1");
        assert_eq!(session.title.as_deref(), Some("Test Session"));
        assert!(session.created_at > 0);
    }

    #[test]
    fn create_session_without_title() {
        let (db, _dir) = test_db();
        let session = create_session(&db, "s1", None).unwrap();
        assert!(session.title.is_none());
    }

    #[test]
    fn create_session_duplicate_id_fails() {
        let (db, _dir) = test_db();
        create_session(&db, "s1", None).unwrap();
        let result = create_session(&db, "s1", None);
        assert!(result.is_err());
    }

    // --- get_last_session ---

    #[test]
    fn get_last_session_empty_db() {
        let (db, _dir) = test_db();
        let result = get_last_session(&db).unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn get_last_session_returns_most_recent() {
        let (db, _dir) = test_db();
        create_session(&db, "s1", Some("First")).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(10));
        create_session(&db, "s2", Some("Second")).unwrap();

        let last = get_last_session(&db).unwrap().unwrap();
        assert_eq!(last.id, "s2");
        assert_eq!(last.title.as_deref(), Some("Second"));
    }

    // --- get_recent_sessions ---

    #[test]
    fn get_recent_sessions_respects_limit() {
        let (db, _dir) = test_db();
        for i in 0..5 {
            std::thread::sleep(std::time::Duration::from_millis(5));
            create_session(&db, &format!("s{}", i), None).unwrap();
        }

        let sessions = get_recent_sessions(&db, 3).unwrap();
        assert_eq!(sessions.len(), 3);
        // Most recent first
        assert_eq!(sessions[0].id, "s4");
    }

    // --- update_session_title ---

    #[test]
    fn update_session_title_works() {
        let (db, _dir) = test_db();
        create_session(&db, "s1", None).unwrap();
        update_session_title(&db, "s1", "New Title").unwrap();

        let session = get_last_session(&db).unwrap().unwrap();
        assert_eq!(session.title.as_deref(), Some("New Title"));
    }

    // --- insert_message + get_session_messages ---

    #[test]
    fn insert_and_get_messages() {
        let (db, _dir) = test_db();
        create_session(&db, "s1", None).unwrap();

        insert_message(
            &db,
            &MessageRow {
                id: "m1".into(),
                session_id: "s1".into(),
                role: "user".into(),
                content: "Hello".into(),
                timestamp: 1000,
                cost_json: None,
                tool_calls_json: None,
            },
        )
        .unwrap();

        insert_message(
            &db,
            &MessageRow {
                id: "m2".into(),
                session_id: "s1".into(),
                role: "assistant".into(),
                content: "Hi there!".into(),
                timestamp: 2000,
                cost_json: Some(r#"{"cost":0.001}"#.into()),
                tool_calls_json: None,
            },
        )
        .unwrap();

        let messages = get_session_messages(&db, "s1").unwrap();
        assert_eq!(messages.len(), 2);
        assert_eq!(messages[0].role, "user");
        assert_eq!(messages[0].content, "Hello");
        assert_eq!(messages[1].role, "assistant");
        assert_eq!(messages[1].content, "Hi there!");
        assert!(messages[1].cost_json.is_some());
    }

    #[test]
    fn get_session_messages_empty() {
        let (db, _dir) = test_db();
        create_session(&db, "s1", None).unwrap();
        let messages = get_session_messages(&db, "s1").unwrap();
        assert!(messages.is_empty());
    }

    #[test]
    fn get_session_messages_ordered_by_timestamp() {
        let (db, _dir) = test_db();
        create_session(&db, "s1", None).unwrap();

        // Insert in reverse order
        insert_message(
            &db,
            &MessageRow {
                id: "m2".into(),
                session_id: "s1".into(),
                role: "assistant".into(),
                content: "Second".into(),
                timestamp: 2000,
                cost_json: None,
                tool_calls_json: None,
            },
        )
        .unwrap();

        insert_message(
            &db,
            &MessageRow {
                id: "m1".into(),
                session_id: "s1".into(),
                role: "user".into(),
                content: "First".into(),
                timestamp: 1000,
                cost_json: None,
                tool_calls_json: None,
            },
        )
        .unwrap();

        let messages = get_session_messages(&db, "s1").unwrap();
        assert_eq!(messages[0].content, "First");
        assert_eq!(messages[1].content, "Second");
    }

    #[test]
    fn messages_isolated_by_session() {
        let (db, _dir) = test_db();
        create_session(&db, "s1", None).unwrap();
        create_session(&db, "s2", None).unwrap();

        insert_message(
            &db,
            &MessageRow {
                id: "m1".into(),
                session_id: "s1".into(),
                role: "user".into(),
                content: "Session 1".into(),
                timestamp: 1000,
                cost_json: None,
                tool_calls_json: None,
            },
        )
        .unwrap();

        insert_message(
            &db,
            &MessageRow {
                id: "m2".into(),
                session_id: "s2".into(),
                role: "user".into(),
                content: "Session 2".into(),
                timestamp: 2000,
                cost_json: None,
                tool_calls_json: None,
            },
        )
        .unwrap();

        let s1_msgs = get_session_messages(&db, "s1").unwrap();
        assert_eq!(s1_msgs.len(), 1);
        assert_eq!(s1_msgs[0].content, "Session 1");

        let s2_msgs = get_session_messages(&db, "s2").unwrap();
        assert_eq!(s2_msgs.len(), 1);
        assert_eq!(s2_msgs[0].content, "Session 2");
    }

    #[test]
    fn insert_message_with_tool_calls_json() {
        let (db, _dir) = test_db();
        create_session(&db, "s1", None).unwrap();

        let tool_calls = r#"[{"toolCallId":"tc-1","toolName":"read_file","status":"success"}]"#;
        insert_message(
            &db,
            &MessageRow {
                id: "m1".into(),
                session_id: "s1".into(),
                role: "assistant".into(),
                content: "Done".into(),
                timestamp: 1000,
                cost_json: None,
                tool_calls_json: Some(tool_calls.into()),
            },
        )
        .unwrap();

        let messages = get_session_messages(&db, "s1").unwrap();
        assert_eq!(
            messages[0].tool_calls_json.as_deref(),
            Some(tool_calls)
        );
    }

    // --- search_messages ---

    #[test]
    fn search_messages_finds_matching() {
        let (db, _dir) = test_db();
        create_session(&db, "s1", None).unwrap();

        insert_message(
            &db,
            &MessageRow {
                id: "m1".into(),
                session_id: "s1".into(),
                role: "user".into(),
                content: "How to use Rust?".into(),
                timestamp: 1000,
                cost_json: None,
                tool_calls_json: None,
            },
        )
        .unwrap();

        insert_message(
            &db,
            &MessageRow {
                id: "m2".into(),
                session_id: "s1".into(),
                role: "user".into(),
                content: "Python is great".into(),
                timestamp: 2000,
                cost_json: None,
                tool_calls_json: None,
            },
        )
        .unwrap();

        let results = search_messages(&db, "Rust", 10).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].content, "How to use Rust?");
    }

    #[test]
    fn search_messages_empty_query_returns_all() {
        let (db, _dir) = test_db();
        create_session(&db, "s1", None).unwrap();
        insert_message(
            &db,
            &MessageRow {
                id: "m1".into(),
                session_id: "s1".into(),
                role: "user".into(),
                content: "test".into(),
                timestamp: 1000,
                cost_json: None,
                tool_calls_json: None,
            },
        )
        .unwrap();

        let results = search_messages(&db, "", 10).unwrap();
        assert_eq!(results.len(), 1);
    }

    #[test]
    fn search_messages_respects_limit() {
        let (db, _dir) = test_db();
        create_session(&db, "s1", None).unwrap();
        for i in 0..10 {
            insert_message(
                &db,
                &MessageRow {
                    id: format!("m{}", i),
                    session_id: "s1".into(),
                    role: "user".into(),
                    content: format!("Message {}", i),
                    timestamp: i * 1000,
                    cost_json: None,
                    tool_calls_json: None,
                },
            )
            .unwrap();
        }

        let results = search_messages(&db, "Message", 3).unwrap();
        assert_eq!(results.len(), 3);
    }

    // --- delete_session ---

    #[test]
    fn delete_session_removes_messages_and_session() {
        let (db, _dir) = test_db();
        create_session(&db, "s1", None).unwrap();
        insert_message(
            &db,
            &MessageRow {
                id: "m1".into(),
                session_id: "s1".into(),
                role: "user".into(),
                content: "test".into(),
                timestamp: 1000,
                cost_json: None,
                tool_calls_json: None,
            },
        )
        .unwrap();

        delete_session(&db, "s1").unwrap();

        let sessions = get_recent_sessions(&db, 10).unwrap();
        assert!(sessions.is_empty());

        let messages = get_session_messages(&db, "s1").unwrap();
        assert!(messages.is_empty());
    }

    #[test]
    fn delete_session_does_not_affect_other_sessions() {
        let (db, _dir) = test_db();
        create_session(&db, "s1", None).unwrap();
        create_session(&db, "s2", None).unwrap();
        insert_message(
            &db,
            &MessageRow {
                id: "m1".into(),
                session_id: "s1".into(),
                role: "user".into(),
                content: "s1 msg".into(),
                timestamp: 1000,
                cost_json: None,
                tool_calls_json: None,
            },
        )
        .unwrap();
        insert_message(
            &db,
            &MessageRow {
                id: "m2".into(),
                session_id: "s2".into(),
                role: "user".into(),
                content: "s2 msg".into(),
                timestamp: 2000,
                cost_json: None,
                tool_calls_json: None,
            },
        )
        .unwrap();

        delete_session(&db, "s1").unwrap();

        let sessions = get_recent_sessions(&db, 10).unwrap();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].id, "s2");

        let messages = get_session_messages(&db, "s2").unwrap();
        assert_eq!(messages.len(), 1);
    }
}

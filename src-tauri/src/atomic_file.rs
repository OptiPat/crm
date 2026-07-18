use atomic_write_file::AtomicWriteFile;
use std::io::{self, Write};
use std::path::Path;

pub fn write(path: &Path, contents: impl AsRef<[u8]>) -> io::Result<()> {
    let mut file = AtomicWriteFile::options().open(path)?;
    file.write_all(contents.as_ref())?;
    file.commit()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU64, Ordering};

    fn unique_temp_dir() -> PathBuf {
        static COUNTER: AtomicU64 = AtomicU64::new(0);
        let n = COUNTER.fetch_add(1, Ordering::Relaxed);
        std::env::temp_dir().join(format!(
            "patrimoine_crm_atomic_file_test_{}_{}",
            std::process::id(),
            n
        ))
    }

    #[test]
    fn atomically_replaces_existing_contents() {
        let dir = unique_temp_dir();
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("config.json");
        fs::write(&path, b"old").unwrap();

        write(&path, b"new").unwrap();

        assert_eq!(fs::read(&path).unwrap(), b"new");
        let _ = fs::remove_dir_all(dir);
    }
}

use rand::Rng;

pub fn generate_six_digit_code() -> String {
    let n = rand::thread_rng().gen_range(100_000..1_000_000);
    format!("{n:06}")
}

pub const LOGIN_CODE_TTL_SECS: i64 = 15 * 60;

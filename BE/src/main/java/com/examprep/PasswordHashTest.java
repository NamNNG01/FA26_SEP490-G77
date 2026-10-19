package com.examprep;

import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

public class PasswordHashTest {
    public static void main(String[] args) {
        BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();

        String password = "Password123!";
        String hash = encoder.encode(password);

        System.out.println("Hash: " + hash);
        System.out.println("Match: " + encoder.matches(password, hash));
    }
}
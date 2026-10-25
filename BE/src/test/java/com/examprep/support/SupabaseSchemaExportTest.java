package com.examprep.support;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.util.List;
import java.util.Map;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
@ActiveProfiles("postgres-test")
public class SupabaseSchemaExportTest {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    public void exportSupabaseSchema() throws IOException {
        List<Map<String, Object>> columns = jdbcTemplate.queryForList(
                "SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default " +
                "FROM information_schema.columns " +
                "WHERE table_schema = 'public' " +
                "ORDER BY table_name, ordinal_position"
        );

        List<Map<String, Object>> tables = jdbcTemplate.queryForList(
                "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY 1"
        );

        File dbDir = new File("docs/db");
        if (!dbDir.exists()) {
            dbDir.mkdirs();
        }

        try (FileWriter fw = new FileWriter(new File(dbDir, "supabase-schema.csv"))) {
            fw.write("table_name,column_name,data_type,udt_name,is_nullable,column_default\n");
            for (Map<String, Object> col : columns) {
                fw.write(String.format("\"%s\",\"%s\",\"%s\",\"%s\",\"%s\",\"%s\"\n",
                        col.get("table_name"),
                        col.get("column_name"),
                        col.get("data_type"),
                        col.get("udt_name"),
                        col.get("is_nullable"),
                        col.get("column_default") != null ? col.get("column_default").toString().replace("\"", "\"\"") : ""
                ));
            }
        }

        System.out.println("TOTAL TABLES: " + tables.size());
        System.out.println("TOTAL COLUMNS: " + columns.size());
    }
}

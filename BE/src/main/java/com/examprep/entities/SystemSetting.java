package com.examprep.entities;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.io.Serializable;
import java.time.Instant;

/**
 * One persisted settings document (admin System Settings). The value is an opaque JSON object —
 * the screen owns its shape, the server only stores and returns it (V90).
 */
@Entity
@Table(name = "system_settings")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SystemSetting implements Serializable {

    @Id
    @Column(name = "setting_key", length = 100)
    private String settingKey;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "setting_value", nullable = false, columnDefinition = "jsonb")
    private String settingValue;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    /** The admin who saved the document last, or null after that account is deleted. */
    @Column(name = "updated_by")
    private Long updatedBy;
}

package com.examprep.controllers;

import com.examprep.entities.Discount;
import com.examprep.entities.UserDiscount;
import com.examprep.repositories.DiscountRepository;
import com.examprep.repositories.UserDiscountRepository;
import com.examprep.support.AbstractPostgresIT;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.io.File;
import java.io.FileWriter;
import java.io.PrintWriter;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

class DiscountDiagnosticTest extends AbstractPostgresIT {

    @Autowired DiscountRepository discountRepository;
    @Autowired UserDiscountRepository userDiscountRepository;

    @Test
    void diagnoseAllDiscounts() throws Exception {
        List<Discount> discounts = discountRepository.findAll();
        List<UserDiscount> userDiscounts = userDiscountRepository.findAll();
        Instant now = Instant.now();

        File dir = new File("docs/analysis");
        if (!dir.exists()) {
            dir.mkdirs();
        }

        StringBuilder sb = new StringBuilder();
        sb.append("# Báo cáo Chẩn đoán Lỗi Áp dụng Mã Giảm Giá (Discount Diagnostic Report)\n\n");
        sb.append("Thời điểm kiểm tra (UTC): `").append(now).append("`\n\n");
        sb.append("Tổng số discount trong DB: **").append(discounts.size()).append("**\n\n");
        sb.append("Tổng số bản ghi user_discounts trong DB: **").append(userDiscounts.size()).append("**\n\n");

        sb.append("## 1. Danh sách chi tiết các Discount hiện có trong Database\n\n");
        sb.append("| ID | Code | Name | Type | Value/Percent | Active | StartAt | ExpiresAt | UsageLimit | UsedCount | MinOrder | AppliesTo | DeletedAt |\n");
        sb.append("|---|---|---|---|---|---|---|---|---|---|---|---|---|\n");

        for (Discount d : discounts) {
            sb.append(String.format("| %d | %s | %s | %s | %s | %s | %s | %s | %d | %d | %s | %s | %s |\n",
                    d.getDiscountId(),
                    d.getCode(),
                    d.getName() != null ? d.getName() : "",
                    d.getDiscountType(),
                    d.getValue() != null ? d.getValue() : d.getPercent(),
                    d.getIsActive(),
                    d.getStartAt() != null ? d.getStartAt().toString() : "NULL",
                    d.getExpiresAt() != null ? d.getExpiresAt().toString() : "NULL",
                    d.getUsageLimit(),
                    d.getUsedCount(),
                    d.getMinOrderAmount() != null ? d.getMinOrderAmount().toString() : "NULL",
                    d.getAppliesTo(),
                    d.getDeletedAt() != null ? d.getDeletedAt().toString() : "NULL"
            ));
        }

        sb.append("\n## 2. Phân tích nguyên nhân lỗi khi Student áp dụng\n\n");
        sb.append("Theo logic kiểm tra discount tại `PaymentServiceImpl.validatedDiscount()`, một mã giảm giá sẽ bị hệ thống từ chối và báo lỗi chung chung là **`Discount is expired, used or does not apply`** (hiển thị cho người dùng là *expired, used or not apply*) khi vi phạm một trong các quy tắc sau:\n\n");
        sb.append("1. **Hết hạn (`expires_at < now`):** Thời gian hết hạn của discount đã qua so với thời điểm hiện tại.\n");
        sb.append("2. **Chưa tới hạn (`start_at > now`):** Mã discount chưa đến ngày bắt đầu hiệu lực.\n");
        sb.append("3. **Hết lượt sử dụng chung (`used_count >= usage_limit`):** Số lượng lượt sử dụng tối đa của mã đã bị dùng hết.\n");
        sb.append("4. **Đã sử dụng bởi học sinh (`user_discounts.is_used = true`):** Học sinh (hoặc tài khoản hiện tại) đã từng sử dụng mã giảm giá này trong một giao dịch trước đó.\n");
        sb.append("5. **Không thỏa mãn giá trị tối thiểu đơn hàng (`price < min_order_amount`):** Giá trị đơn hàng mua khóa học hoặc gói subscription nhỏ hơn số tiền tối thiểu mà mã yêu cầu.\n");
        sb.append("6. **Phạm vi áp dụng không khớp (`appliesTo`):** Mã giảm giá giới hạn chỉ áp dụng cho `COURSE` hoặc `SUBSCRIPTION`, nhưng học sinh đang thực hiện thanh toán loại sản phẩm khác.\n");
        sb.append("7. **Vô hiệu hóa / Xóa mềm (`is_active = false` hoặc `deleted_at IS NOT NULL`):** Mã đã bị vô hiệu hóa hoặc xóa trên hệ thống quản lý của Admin.\n\n");

        sb.append("### Kết quả đánh giá chi tiết từng mã trong Database:\n\n");

        for (Discount d : discounts) {
            sb.append("#### Mã: `").append(d.getCode()).append("` (ID: ").append(d.getDiscountId()).append(")\n");
            boolean hasIssue = false;

            if (d.getDeletedAt() != null) {
                sb.append("- ❌ **Bị xóa mềm (`deleted_at`):** ").append(d.getDeletedAt()).append(" $\\to$ Sẽ báo lỗi do không tồn tại hoặc bị hủy.\n");
                hasIssue = true;
            }
            if (!Boolean.TRUE.equals(d.getIsActive())) {
                sb.append("- ❌ **Không kích hoạt (`is_active = false`):** $\\to$ Sẽ báo lỗi `expired, used or not apply`.\n");
                hasIssue = true;
            }
            if (d.getStartAt() != null && d.getStartAt().isAfter(now)) {
                sb.append("- ❌ **Chưa bắt đầu (`start_at`):** ").append(d.getStartAt()).append(" $\\to$ Sẽ báo lỗi vì chưa đến thời gian áp dụng.\n");
                hasIssue = true;
            }
            if (d.getExpiresAt() != null && d.getExpiresAt().isBefore(now)) {
                sb.append("- ❌ **Đã hết hạn (`expires_at`):** ").append(d.getExpiresAt()).append(" $\\to$ Sẽ báo lỗi **`expired`**.\n");
                hasIssue = true;
            }
            if (d.getUsedCount() >= d.getUsageLimit()) {
                sb.append("- ❌ **Hết lượt sử dụng (`used_count` = ").append(d.getUsedCount()).append(" >= `usage_limit` = ").append(d.getUsageLimit()).append(") $\\to$ Sẽ báo lỗi **`used`**.\n");
                hasIssue = true;
            }
            if (d.getMinOrderAmount() != null && d.getMinOrderAmount().compareTo(BigDecimal.ZERO) > 0) {
                sb.append("- ⚠️ **Điều kiện giá trị đơn hàng tối thiểu (`min_order_amount`):** ").append(d.getMinOrderAmount()).append(" $\\to$ Sẽ báo lỗi **`not apply`** nếu đơn hàng thấp hơn mức này.\n");
            }
            if (!"ALL".equalsIgnoreCase(d.getAppliesTo())) {
                sb.append("- ⚠️ **Giới hạn phạm vi (`appliesTo`):** ").append(d.getAppliesTo()).append(" $\\to$ Sẽ báo lỗi **`not apply`** nếu mua sai loại sản phẩm.\n");
            }

            long assignedCount = userDiscounts.stream().filter(ud -> ud.getDiscount().getDiscountId().equals(d.getDiscountId())).count();
            long usedUserCount = userDiscounts.stream().filter(ud -> ud.getDiscount().getDiscountId().equals(d.getDiscountId()) && Boolean.TRUE.equals(ud.getIsUsed())).count();
            sb.append("- ℹ️ **Thống kê cấp phát (`user_discounts`):** Số lượng gán cho user: ").append(assignedCount).append(", Đã đánh dấu sử dụng (`is_used=true`): ").append(usedUserCount).append("\n");

            if (!hasIssue) {
                sb.append("- ✅ **Đánh giá:** Mã cơ bản hợp lệ. Nếu học sinh bấm áp dụng vẫn báo lỗi, nguyên nhân do **Đơn hàng chưa đạt `min_order_amount`**, **Mua sai loại `appliesTo`** (ví dụ mua gói subscription nhưng mã chỉ áp dụng cho course), hoặc **Tài khoản học sinh đã dùng mã này trước đó** (`is_used = true`).\n");
            }
            sb.append("\n");
        }

        try (PrintWriter writer = new PrintWriter(new FileWriter("docs/analysis/discount-diagnostic-report.md"))) {
            writer.write(sb.toString());
        }

        System.out.println("Discount diagnostic report generated successfully at docs/analysis/discount-diagnostic-report.md");
    }
}

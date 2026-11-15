import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from copy import copy

wb = openpyxl.load_workbook('Phan_cong_API_G77.xlsx')
ws = wb['Nam']

new_apis = [
    (59.0, 'MD-01', 'discussion-fe-integration-guide', 'Course Manager · Quản lý thảo luận', 'POST',
     '/api/v1/manager/courses/{courseId}/discussions', 'Manager tạo thảo luận / thông báo khóa học (auto-approved, ảnh, ghim)',
     'Dũng', 'Đã có endpoint', 'controllers/ManagerDiscussionController.java → createDiscussion()',
     'services/ManagerDiscussionService.java\nservices/ManagerDiscussionServiceImpl.java',
     'repositories/CourseManagerRepository.java\nrepositories/CourseRepository.java\nrepositories/DiscussionRepository.java\nrepositories/UserRepository.java',
     'entities/Course.java\nentities/Discussion.java\nentities/User.java',
     'dto/ApiResponse.java\ndto/discussion/DiscussionManagerDtos.java\ndto/student/DiscussionDetailDto.java',
     None, 'Chưa ghép', 'Tự động phê duyệt ngay khi tạo, hỗ trợ đính kèm ảnh và ghim', 'Đã test'),

    (60.0, 'MD-02', 'discussion-fe-integration-guide', 'Course Manager · Quản lý thảo luận', 'GET',
     '/api/v1/manager/courses/{courseId}/discussions', 'Danh sách thảo luận trong khóa học cho Manager (lọc PENDING/APPROVED/REJECTED/ALL, status, search)',
     'Dũng', 'Đã có endpoint', 'controllers/ManagerDiscussionController.java → listDiscussions()',
     'services/ManagerDiscussionService.java\nservices/ManagerDiscussionServiceImpl.java',
     'repositories/CourseManagerRepository.java\nrepositories/CourseRepository.java\nrepositories/DiscussionRepository.java\nrepositories/UserRepository.java',
     'entities/Course.java\nentities/Discussion.java\nentities/User.java',
     'dto/ApiResponse.java\ndto/PageResponse.java\ndto/student/DiscussionItemDto.java',
     None, 'Chưa ghép', 'Hỗ trợ lọc theo trạng thái duyệt PENDING/APPROVED/REJECTED/ALL', 'Đã test'),

    (61.0, 'MD-03', 'discussion-fe-integration-guide', 'Course Manager · Quản lý thảo luận', 'GET',
     '/api/v1/manager/discussions/{discussionId}', 'Chi tiết thảo luận cho Manager (kèm toàn bộ comment cả VISIBLE và HIDDEN)',
     'Dũng', 'Đã có endpoint', 'controllers/ManagerDiscussionController.java → getDiscussionDetail()',
     'services/ManagerDiscussionService.java\nservices/ManagerDiscussionServiceImpl.java',
     'repositories/CourseManagerRepository.java\nrepositories/CourseRepository.java\nrepositories/DiscussionCommentRepository.java\nrepositories/DiscussionRepository.java\nrepositories/UserRepository.java',
     'entities/Course.java\nentities/Discussion.java\nentities/DiscussionComment.java\nentities/User.java',
     'dto/ApiResponse.java\ndto/student/DiscussionDetailDto.java',
     None, 'Chưa ghép', 'Manager xem được toàn bộ bình luận kể cả bình luận đã bị ẩn', 'Đã test'),

    (62.0, 'MD-04', 'discussion-fe-integration-guide', 'Course Manager · Quản lý thảo luận', 'POST',
     '/api/v1/manager/discussions/{discussionId}/approve', 'Manager phê duyệt bài thảo luận của học sinh',
     'Dũng', 'Đã có endpoint', 'controllers/ManagerDiscussionController.java → approveDiscussion()',
     'services/ManagerDiscussionService.java\nservices/ManagerDiscussionServiceImpl.java',
     'repositories/CourseManagerRepository.java\nrepositories/CourseRepository.java\nrepositories/DiscussionRepository.java\nrepositories/UserRepository.java',
     'entities/Course.java\nentities/Discussion.java\nentities/User.java',
     'dto/ApiResponse.java\ndto/student/DiscussionItemDto.java',
     None, 'Chưa ghép', 'Chuyển approval_status sang APPROVED để hiển thị công khai', 'Đã test'),

    (63.0, 'MD-05', 'discussion-fe-integration-guide', 'Course Manager · Quản lý thảo luận', 'POST',
     '/api/v1/manager/discussions/{discussionId}/reject', 'Manager từ chối bài thảo luận của học sinh kèm lý do',
     'Dũng', 'Đã có endpoint', 'controllers/ManagerDiscussionController.java → rejectDiscussion()',
     'services/ManagerDiscussionService.java\nservices/ManagerDiscussionServiceImpl.java',
     'repositories/CourseManagerRepository.java\nrepositories/CourseRepository.java\nrepositories/DiscussionRepository.java\nrepositories/UserRepository.java',
     'entities/Course.java\nentities/Discussion.java\nentities/User.java',
     'dto/ApiResponse.java\ndto/discussion/DiscussionManagerDtos.java\ndto/student/DiscussionItemDto.java',
     None, 'Chưa ghép', 'Chuyển approval_status sang REJECTED và lưu rejection_reason', 'Đã test'),

    (64.0, 'MD-06', 'discussion-fe-integration-guide', 'Course Manager · Quản lý thảo luận', 'PATCH',
     '/api/v1/manager/discussions/{discussionId}/pin', 'Manager ghim / bỏ ghim bài thảo luận lên đầu khóa học',
     'Dũng', 'Đã có endpoint', 'controllers/ManagerDiscussionController.java → updatePin()',
     'services/ManagerDiscussionService.java\nservices/ManagerDiscussionServiceImpl.java',
     'repositories/CourseManagerRepository.java\nrepositories/CourseRepository.java\nrepositories/DiscussionRepository.java\nrepositories/UserRepository.java',
     'entities/Course.java\nentities/Discussion.java\nentities/User.java',
     'dto/ApiResponse.java\ndto/discussion/DiscussionManagerDtos.java\ndto/student/DiscussionItemDto.java',
     None, 'Chưa ghép', 'Cập nhật is_pinned (true/false)', 'Đã test'),

    (65.0, 'MD-07', 'discussion-fe-integration-guide', 'Course Manager · Quản lý thảo luận', 'PATCH',
     '/api/v1/manager/discussions/{discussionId}/close', 'Manager đóng / mở lại bài thảo luận bất kỳ trong khóa học',
     'Dũng', 'Đã có endpoint', 'controllers/ManagerDiscussionController.java → updateClose()',
     'services/ManagerDiscussionService.java\nservices/ManagerDiscussionServiceImpl.java',
     'repositories/CourseManagerRepository.java\nrepositories/CourseRepository.java\nrepositories/DiscussionRepository.java\nrepositories/UserRepository.java',
     'entities/Course.java\nentities/Discussion.java\nentities/User.java',
     'dto/ApiResponse.java\ndto/student/UpdateDiscussionRequestDto.java\ndto/student/DiscussionItemDto.java',
     None, 'Chưa ghép', 'Cập nhật is_closed và status (CLOSED/OPEN)', 'Đã test'),

    (66.0, 'MD-08', 'discussion-fe-integration-guide', 'Course Manager · Quản lý thảo luận', 'DELETE',
     '/api/v1/manager/discussions/{discussionId}', 'Manager xóa bài thảo luận vi phạm',
     'Dũng', 'Đã có endpoint', 'controllers/ManagerDiscussionController.java → deleteDiscussion()',
     'services/ManagerDiscussionService.java\nservices/ManagerDiscussionServiceImpl.java',
     'repositories/CourseManagerRepository.java\nrepositories/CourseRepository.java\nrepositories/DiscussionRepository.java\nrepositories/UserRepository.java',
     'entities/Course.java\nentities/Discussion.java\nentities/User.java',
     'dto/ApiResponse.java',
     None, 'Chưa ghép', 'Xóa vĩnh viễn bài thảo luận và các bình luận liên quan (cascade)', 'Đã test'),

    (67.0, 'MD-09', 'discussion-fe-integration-guide', 'Course Manager · Quản lý thảo luận', 'PATCH',
     '/api/v1/manager/discussions/comments/{commentId}/status', 'Manager ẩn / hiện bình luận vi phạm',
     'Dũng', 'Đã có endpoint', 'controllers/ManagerDiscussionController.java → updateCommentStatus()',
     'services/ManagerDiscussionService.java\nservices/ManagerDiscussionServiceImpl.java',
     'repositories/CourseManagerRepository.java\nrepositories/CourseRepository.java\nrepositories/DiscussionCommentRepository.java\nrepositories/UserRepository.java',
     'entities/Course.java\nentities/Discussion.java\nentities/DiscussionComment.java\nentities/User.java',
     'dto/ApiResponse.java\ndto/discussion/DiscussionManagerDtos.java\ndto/student/DiscussionDetailDto.java',
     None, 'Chưa ghép', 'Cập nhật status (HIDDEN/VISIBLE), lưu hidden_by, hidden_reason', 'Đã test'),

    (68.0, 'MD-10', 'discussion-fe-integration-guide', 'Course Manager · Quản lý thảo luận', 'DELETE',
     '/api/v1/manager/discussions/comments/{commentId}', 'Manager xóa bình luận vi phạm',
     'Dũng', 'Đã có endpoint', 'controllers/ManagerDiscussionController.java → deleteComment()',
     'services/ManagerDiscussionService.java\nservices/ManagerDiscussionServiceImpl.java',
     'repositories/CourseManagerRepository.java\nrepositories/CourseRepository.java\nrepositories/DiscussionCommentRepository.java\nrepositories/UserRepository.java',
     'entities/Course.java\nentities/Discussion.java\nentities/DiscussionComment.java\nentities/User.java',
     'dto/ApiResponse.java',
     None, 'Chưa ghép', 'Xóa vĩnh viễn bình luận và giảm commentCount của bài viết', 'Đã test')
]

# Style references from row 62
ref_row = 62
ref_font = copy(ws.cell(ref_row, 2).font)
ref_border = copy(ws.cell(ref_row, 2).border)

start_row = 63
for idx, api in enumerate(new_apis):
    cur_row = start_row + idx
    for col_idx, val in enumerate(api, start=1):
        cell = ws.cell(row=cur_row, column=col_idx, value=val)
        cell.font = copy(ref_font)
        cell.border = copy(ref_border)
        if col_idx == 1:
            cell.alignment = Alignment(horizontal='center', vertical='top', wrap_text=True)
        else:
            cell.alignment = Alignment(vertical='top', wrap_text=True)

# Count total API rows in Nam (from row 5 to current row)
total_apis = cur_row - 4
ws.cell(1, 1).value = f'Nam — Backend · {total_apis} API'

# Update summary tab formula for Nam
ws_tonghop = wb['Tổng hợp']
ws_tonghop.cell(5, 3).value = f'=COUNTA(Nam!B5:B{cur_row})'
ws_tonghop.cell(5, 4).value = f'=COUNTIF(Nam!I5:I{cur_row},"Đã có endpoint")'
ws_tonghop.cell(5, 7).value = f'=COUNTIF(Nam!R5:R{cur_row},"Xong")'
ws_tonghop.cell(5, 8).value = f'=COUNTIF(Nam!R5:R{cur_row},"Đã test")'

wb.save('Phan_cong_API_G77.xlsx')
print(f'Successfully added {len(new_apis)} APIs to sheet Nam (rows {start_row} to {cur_row}).')
print(f'Updated title: {ws.cell(1, 1).value}')

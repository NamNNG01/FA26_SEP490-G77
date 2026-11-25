/** Envelope every backend endpoint returns (com.examprep.dto.ApiResponse). */
export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

type SuccessResult<T> = {
  status: "success",
  data: T
};

type FailedResult = {
  status: "failed",
  message: any
}

export type Result<T> = SuccessResult<T> | FailedResult;
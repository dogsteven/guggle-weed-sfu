type SuccessResult<T> = {
  status: "success",
  data: T
};

type FailedResult = {
  status: "failed",
  message: any
}

export type Result<T> = SuccessResult<T> | FailedResult;

export function wrapVoid(handler: () => void): Result<{}> {
  return wrapResult(() => {
    handler();
    return {};
  });
}

export function wrapVoidAsync(handler: () => Promise<void>): Promise<Result<{}>> {
  return wrapResultAsync(async () => {
    await handler();
    return {};
  });
}

export function wrapResult<T>(computation: () => T): Result<T> {
  try {
    return {
      status: "success",
      data: computation()
    };
  } catch (error) {
    return {
      status: "failed",
      message: error  
    };
  }
}

export async function wrapResultAsync<T>(computation: () => Promise<T>): Promise<Result<T>> {
  try {
    return {
      status: "success",
      data: await computation()
    };
  } catch (error) {
    return {
      status: "failed",
      message: error  
    };
  }
}
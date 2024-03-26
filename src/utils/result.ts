type SuccessResult<T> = {
  status: "success",
  data: T
};

type FailedResult = {
  status: "failed",
  message: any
}

export type Result<T> = SuccessResult<T> | FailedResult;

export function wrapVoid(handler: () => void): Result<any> {
  try {
    handler();
  } catch (error) {
    return {
      status: "failed",
      message: error
    };
  }
}

export async function wrapVoidAsync(handler: () => Promise<void>): Promise<Result<any>> {
  try {
    await handler();
  } catch (error) {
    return {
      status: "failed",
      message: error
    };
  }
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

export function bindResult<T>(binder: () => Result<T>): Result<T> {
  try {
    return binder();
  } catch (error) {
    return {
      status: "failed",
      message: error
    };
  }
}

export async function bindResultAsync<T>(binder: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await binder();
  } catch (error) {
    return {
      status: "failed",
      message: error
    };
  }
}
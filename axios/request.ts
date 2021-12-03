import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, Canceler } from 'axios'
import Storage from '@/utils/Storage'
import { Modal, message as Message } from 'ant-design-vue'
import store from '@/store';
import { checkStatus } from './check-status';
import { BasicResponseModel } from '@/api/model/common';
import { AuthForm } from '@/api/model/userModel';

declare module 'axios' {
  export interface AxiosRequestConfig {
    noToken?: boolean
    neverCancel?: boolean
  }
}

const CancelToken = axios.CancelToken; // axios 的取消请求

const headers = {
  'Content-Type': 'application/json;charset=utf-8'
}

Object.assign(axios.defaults.headers, headers)

const server = axios.create({
  baseURL: '/api',
  timeout: 60000,
})

// 防止重复提交 利用axios的cancelToken
const pending: any[] = []; // 声明一个数组用于存储每个ajax请求的取消函数和ajax标识

/**
 * 取消重复请求
 * @param config
 * @param f
 */
const removePending = (config: AxiosRequestConfig, cancel: Canceler | null) => {
  const flgUrl = config.url;
  if (pending.includes(flgUrl)) {
    if (cancel) {
      // cancel(`pending-error ${flgUrl}`);
      cancel('取消重复请求');
    } else {
      pending.splice(pending.indexOf(flgUrl), 1); // 删除记录
    }
  } else {
    if (cancel) {
      pending.push(flgUrl);
    }
  }
}

// request拦截器
server.interceptors.request.use((config: AxiosRequestConfig) => {
  
  if (!config.neverCancel) {
    // 生成canalToken
    config.cancelToken = new CancelToken((c: Canceler) => {
      removePending(config, c);
    });
  }

  if (Storage.getCookie('token') && !config.noToken) {
    Object.assign(config.headers, {
      Authorization: 'Bearer ' + Storage.getCookie('token')
    })
  }

  return config
})

// response响应拦截器
server.interceptors.response.use((res: AxiosResponse<BasicResponseModel | AuthForm>) => {
  removePending(res.config, null)
  
  // 过滤登录请求
  if(res.config.url === '/auth/oauth/token') {
    return res.data;
  }
  
  const { code = 0, msg } = res.data as BasicResponseModel

  // token失效或无权限
  if (code === 401) {
    Modal.destroyAll()
    Modal.confirm({
      content: '登录状态已过期，您可以继续留在该页面，或者重新登录',
      onOk: () => {
        store.dispatch('user/logout');
      },
      onCancel: () => {
        Modal.destroyAll()
      }
    })
    return Promise.reject()
  }

  if (code !== 0) {
    checkStatus(code, msg)
  }

  return res.data
},
  error => {
    let { config, message } = error;

    removePending(config, null)
    
    if (message == "Network Error") {
      message = "后端接口连接异常";
    }
    else if (message.includes("timeout")) {
      message = "系统接口请求超时";
    }
    else if(message.includes("Request failed with status code 424")){
      Modal.destroyAll()
      Modal.confirm({
        content: '登录状态已过期，您可以继续留在该页面，或者重新登录',
        onOk: () => {
          store.dispatch('user/logout');
        },
        onCancel: () => {
          Modal.destroyAll()
        }
      })
      return Promise.reject()
    }
    else if (message.includes("Request failed with status code")) {
      message = "系统接口" + message.substr(message.length - 3) + "异常";
    }
    Message.error(message)
    return Promise.reject(error)
  }
)

export default server
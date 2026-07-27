import { useEffect, useState } from 'react'
import Dashboard from './containers/Dashboard/Dashboard'
import Login from './containers/Login/Login'
import { api, session } from './services/api'

function App() {
  const [user,setUser]=useState(null)
  const [checking,setChecking]=useState(Boolean(session.getToken()))

  useEffect(()=>{
    if(!session.getToken()) return
    api('/auth/me').then(setUser).catch(()=>session.clear()).finally(()=>setChecking(false))
  },[])

  if(checking) return <div className="grid min-h-screen place-items-center bg-[#eef3f6] text-xs text-[#5f7485]">กำลังตรวจสอบสิทธิ์...</div>
  if(!user) return <Login onLogin={setUser}/>
  return <Dashboard user={user} onLogout={()=>{session.clear();setUser(null)}} />
}

export default App

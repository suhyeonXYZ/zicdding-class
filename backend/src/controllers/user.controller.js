import bcrypt from "bcryptjs";
import { generateRefreshToken, generateToken, saveRefreshToken, replaceAccessToken, updateRefreshToken } from "../utils/jwt";
import { resetUserPassword } from "../utils/users";
import promisePool from "../../config/db";
import setResponseJson from "../utils/responseDto";

const output = {
    signUp : (req,res) =>{
        res.send('회원가입');
    },

    signIn : (req,res) =>{
        res.render('login_test1.ejs');
    },

    'change-password':(req,res) =>{
        res.render('pwd_change.ejs');
    },

    logout : (req,res) =>{
              res.clearCookie('accessToken');
              res.clearCookie('refreshToken');
              setResponseJson(res, 200, '로그아웃 성공');
              console.log('로그아웃 성공') 
    },

    'check-email' : async (req, res) => {
        const userEmail = req.body.email;
        const sql = 'SELECT count(email) AS result FROM TB_USER WHERE email = ?;';
        console.log(userEmail)
        try{
            const [rows] = await promisePool.query(sql,[userEmail]);
            console.log(rows)
            if(rows[0].length > 0) {
                setResponseJson(res,409,"이미 사용중인 이메일입니다.");
            }else{
                setResponseJson(res,200,"사용 가능한 이메일입니다.");
            }
        }catch(err){
            console.log(err);
            setResponseJson(res, 500, {error : err.message} );
        }
    },

    me : async (req,res) =>{
        const userId = req.user.userId;
        const sql = 'SELECT nickname, email, password, phone_num FROM TB_USER where user_id = ?';
        try{
            const [rows] = await promisePool.query(sql, [userId]);
            const result = rows[0];
            console.log(rows)
            if(rows.length > 0) {
                setResponseJson(res,200,"마이페이지 조회 성공", result);
            }else{
                setResponseJson(res,500,"마이페이지 조회 실패");
            }
        }catch(err){
            console.log(err);
            setResponseJson(res,500,"마이페이지 조회 실패", err.message );
        }
    }
}

const process = {
    signUp : async (req, res) =>  {
        const {email, password, nickname, phoneNum} = req.body;
        const passwordBycrpt = bcrypt.hashSync(password, 12);        
        const sql = `INSERT 
        INTO TB_USER ( email, password, nickname, phone_num, created_date, mod_date ) 
        VALUES ( ?, ?, ?, ?, now(), now())`;
        const checkSql = 'SELECT email FROM TB_USER WHERE email = ?';
        const data = [email, passwordBycrpt, nickname, phoneNum];
        try{
                const [checkRows] = await promisePool.query(checkSql,[email]);
                if(checkRows.length > 0) {
                    setResponseJson(res, 409, '이미 사용중인 이메일입니다.');
                }else{
                    const [rows] = await promisePool.query(sql, data);
                    const userId = rows.insertId;
                    const accessToken = generateToken(userId);
                    const refreshToken = generateRefreshToken(userId);
                    saveRefreshToken(userId, refreshToken);
                    res.cookie('accessToken', accessToken, {
                        httpOnly : true,
                        sameSite: 'strict',
                        secure : false,
                    expires: new Date(Date.now() + 12 * 60 * 60 * 1000) //12시간
                    });
                    res.cookie('refreshToken', refreshToken, {
                        httpOnly: true,
                        sameSite: 'strict',
                        secure : false,
                        expires: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) // 90일
                    });
                    setResponseJson(res, 200, '회원가입 완료! 환영합니다', {accessToken, refreshToken,userId});
                    console.log(result);
                }
            }catch(err){
                setResponseJson(res,500,'회원가입 중 오류 발생', {error : err.message})
            }
            
         
    },

    signIn : async (req, res )=> {
        const {email, password} = req.body;
        console.log(email)
        const sql = 'SELECT * FROM TB_USER WHERE email = ?';
        try{
            const [rows] = await promisePool.query(sql,[email, password]);
            const rowsPassword = rows[0].password;
            if(rows.length > 0){
                bcrypt.compare(password, rowsPassword, (err,isMatch) =>{
                    if(isMatch === true){
                        const userId = rows[0].user_id;
                        const accessToken = generateToken(userId);
                        const refreshToken = generateRefreshToken(userId);
                        saveRefreshToken(userId, refreshToken);

                        res.cookie('accessToken', accessToken, {
                            httpOnly : true,
                            sameSite: 'strict',
                            secure : false,
                           expires: new Date(Date.now() + 12 * 60 * 60 * 1000)
                        });
                        res.cookie('refreshToken', refreshToken, {
                            httpOnly: true,
                            sameSite: 'strict',
                            secure : false,
                            expires: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) // 90일
                        });
                        setResponseJson(res,200,'로그인 성공', {accessToken, refreshToken, userId});
                   
                    }else{
                        setResponseJson(res, 400, '아이디(로그인 전용 아이디) 또는 비밀번호를 잘못 입력했습니다.입력하신 내용을 다시 확인해주세요.');
                        console.log(err)
                    }
                });               
            }else{
            setResponseJson(res, 401, '로그인 실패');
            console.log(err)
            }   
        }catch(err){
        setResponseJson(res, 500, err.message);
        console.log(err)
        }
    },

    replaceToken : (req, res) =>{
        const refreshToken = req.cookies.refreshToken;
        if(!refreshToken)
            return setResponseJson(res ,403, '토큰 만료');
        updateRefreshToken(refreshToken)
        .then((newRefreshToken) => {
            replaceAccessToken(newRefreshToken)
                .then((newAccessToken) => {
                    setTokensInCookies(res, newAccessToken, newRefreshToken);
                    setResponseJson(res, 200, '토큰 재발급', { accessToken: newAccessToken, refreshToken: newRefreshToken });
                })
                .catch((err) => {
                    setResponseJson(res, 403, err.message);
                });
        })
        .catch((err) => {
            setResponseJson(res, 403, err.message);
        });
    },

    'reset-password' : async (req, res) => {
        const email = req.body.email;     
         if (!email) {
            setResponseJson(res,400,'이메일을 입력하세요.');
        }
        const sql = 'SELECT * FROM TB_USER WHERE email = ?';
        const [rows] = await promisePool.query(sql,[email]);
        try{
            if(rows.length > 0){
                const userId = rows[0].user_id;
                resetUserPassword(userId, email,res);
            }else{
               setResponseJson(res, 400, '존재하지 않는 ID입니다.');
            }
        }catch(err){
            setResponseJson(res,500,{message : err.message})
        }
  
    },

    'change-password' : async (req,res) =>{
        const {password, newPassword}  = req.body;
        const userId = req.user.userId;

        const hashedPaaword = bcrypt.hashSync(newPassword, 12);
        const sql = 'UPDATE TB_USER SET password = ?, mod_date = now() where user_id =?';
        const checkSql = 'SELECT password from TB_USER where user_id = ?';
        try{
        
            const [checkRows] = await promisePool.query(checkSql,[userId]);
            const checkRowsPassword = checkRows[0].password;
            
            if(checkRows.length > 0){
                const isMatch = await bcrypt.compare(password, checkRowsPassword );
                if(!isMatch){
                    setResponseJson(res,401, '없는 비밀번호입니다.')
                }
                 const [updateResult] = await promisePool.query(sql, [hashedPaaword, userId]);

                 if(updateResult.affectedRows > 0) {
                    setResponseJson(res, 200, '비밀번호 변경에 성공하였습니다.');
                }else{
                    setResponseJson(res, 500,'비밀번호 변경 중 오류가 발생했습니다.');
                }
            }
        }catch(err){
            console.log(err);
            setResponseJson(res,500,'비밀번호 변경 중 오류가 발생했습니다.', {error : err.message})
        }   
    },

    me : async (req,res) =>{
        //const userId = req.user.userId;
        const {nickname, phoneNum} = req.body;
        const newPassword = req.body.newPassword;
        const userId = req.user.userId;
        const sql = `
        UPDATE TB_USER 
        SET 
            nickname = IFNULL(NULLIF(?, ""), nickname), 
            password = IFNULL(NULLIF(?, ""), password), 
            phone_num = IFNULL(NULLIF(?, ""), phone_num) 
        WHERE user_id = ?;`;
     try{
            if(newPassword){
                const hashedPaaword = bcrypt.hashSync(newPassword, 12);
                const values = [
                    nickname || "", 
                    hashedPaaword || "", 
                    phoneNum || "", 
                    userId
                ];
                const rows =   await promisePool.query(sql, values);
                if(rows.affectedRows > 0){
                    setResponseJson(res,200,'마이페이지 정보 변경에 성공하였습니다.',rows);
                }else{
                    setResponseJson(res, 500,'마이페이지 정보 변경 중 오류가 발생했습니다.');
                }
            }else{
                const values = [
                    nickname || "",
                    newPassword || "",  
                    phoneNum || "", 
                    userId
                ];
                const [rows] =   await promisePool.query(sql, values);
                if(rows.affectedRows > 0){
                    setResponseJson(res,200,'마이페이지 정보 변경에 성공하였습니다.');
                }else{
                    setResponseJson(res, 500,'마이페이지 정보 변경 중 오류가 발생했습니다.');
                }
            }
        }catch(err){
            console.log(err);
            setResponseJson(res,500,'마이페이지 정보 변경 중 오류가 발생했습니다.', {error : err.message})
        }
    }
}



module.exports = {
    output,
    process
}